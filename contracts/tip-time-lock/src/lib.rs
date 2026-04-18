#![no_std]
#![allow(clippy::too_many_arguments)]

mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Vec,
};
use types::{Asset, Error, TimeLockStatus, TimeLockTip};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TipActionEvent {
    pub action: String,
    pub tip_id: String,
    pub tipper: Address,
    pub artist: Address,
    pub amount: i128,
    pub required_sigs: Option<u32>,
    pub approvals: Option<u32>,
    pub operator: Address,
    pub status: String,
    pub expires_at: Option<u64>,
    pub timestamp: u64,
}

impl TipActionEvent {
    fn new(
        env: &Env,
        action: &str,
        tip_id: String,
        tipper: Address,
        artist: Address,
        amount: i128,
        required_sigs: Option<u32>,
        approvals: Option<u32>,
        operator: Address,
        status: &str,
        expires_at: Option<u64>,
    ) -> TipActionEvent {
        TipActionEvent {
            action: String::from_str(env, action),
            tip_id,
            tipper,
            artist,
            amount,
            required_sigs,
            approvals,
            operator,
            status: String::from_str(env, status),
            expires_at,
            timestamp: env.ledger().timestamp(),
        }
    }
}

#[contract]
pub struct TimeLockContract;

#[contractimpl]
impl TimeLockContract {
    pub fn create_time_lock_tip(
        env: Env,
        tipper: Address,
        artist: Address,
        amount: i128,
        asset_address: Address,
        unlock_time: u64,
        message: String,
        nonce: u64,
    ) -> Result<String, Error> {
        tipper.require_auth();

        // Replay protection: check and update actor nonce
        let last_nonce: u64 = env
            .storage()
            .instance()
            .get(&types::DataKey::ActorNonce(tipper.clone()))
            .unwrap_or(0);
        if nonce <= last_nonce {
            return Err(Error::InvalidNonce);
        }
        env.storage()
            .instance()
            .set(&types::DataKey::ActorNonce(tipper.clone()), &nonce);

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let current_time = env.ledger().timestamp();
        if unlock_time <= current_time {
            return Err(Error::InvalidUnlockTime);
        }

        // Lock funds inside contract
        let token_client = token::Client::new(&env, &asset_address);
        token_client.transfer(&tipper, &env.current_contract_address(), &amount);

        let counter = storage::increment_counter(&env);

        // Generate lock_id (simple string conversion of counter)
        let mut buf = [0u8; 10];
        let mut i = 10;
        let mut n = counter;
        if n == 0 {
            i -= 1;
            buf[i] = b'0';
        } else {
            while n > 0 {
                i -= 1;
                buf[i] = b'0' + (n % 10) as u8;
                n /= 10;
            }
        }
        let lock_id_str = core::str::from_utf8(&buf[i..]).unwrap();
        let lock_id = String::from_str(&env, lock_id_str);

        let tip = TimeLockTip {
            lock_id: lock_id.clone(),
            tipper,
            artist,
            amount,
            asset: Asset::Token(asset_address),
            unlock_time,
            message,
            status: TimeLockStatus::Locked,
            created_at: current_time,
        };

        storage::save_tip(&env, lock_id.clone(), &tip);

        // Emit canonical tip action event
        env.events().publish(
            (symbol_short!("TIP"), symbol_short!("CREATE")),
            TipActionEvent::new(
                &env,
                "CREATE",
                lock_id.clone(),
                tip.tipper.clone(),
                tip.artist.clone(),
                tip.amount,
                None,
                None,
                tip.tipper.clone(),
                "LOCKED",
                Some(tip.unlock_time),
            ),
        );

        Ok(lock_id)
    }

    pub fn claim_tip(
        env: Env,
        lock_id: String,
        artist: Address,
        nonce: u64,
    ) -> Result<i128, Error> {
        artist.require_auth();

        // Replay protection: check and update actor nonce
        let last_nonce: u64 = env
            .storage()
            .instance()
            .get(&types::DataKey::ActorNonce(artist.clone()))
            .unwrap_or(0);
        if nonce <= last_nonce {
            return Err(Error::InvalidNonce);
        }
        env.storage()
            .instance()
            .set(&types::DataKey::ActorNonce(artist.clone()), &nonce);

        let mut tip = storage::get_tip(&env, lock_id).ok_or(Error::LockNotFound)?;

        if tip.artist != artist {
            return Err(Error::Unauthorized);
        }

        if tip.status != TimeLockStatus::Locked {
            return Err(Error::AlreadyClaimedOrRefunded);
        }

        let current_time = env.ledger().timestamp();
        if current_time < tip.unlock_time {
            return Err(Error::NotUnlockedYet);
        }

        tip.status = TimeLockStatus::Claimed;
        storage::update_tip(&env, &tip);

        // Transfer funds to artist
        match &tip.asset {
            Asset::Token(token_address) => {
                let token_client = token::Client::new(&env, token_address);
                token_client.transfer(&env.current_contract_address(), &artist, &tip.amount);
            }
        }

        // Emit canonical tip action event for claim (execute)
        env.events().publish(
            (symbol_short!("TIP"), symbol_short!("EXECUTE")),
            TipActionEvent::new(
                &env,
                "EXECUTE",
                tip.lock_id.clone(),
                tip.tipper.clone(),
                tip.artist.clone(),
                tip.amount,
                None,
                None,
                artist.clone(),
                "CLAIMED",
                Some(tip.unlock_time),
            ),
        );

        Ok(tip.amount)
    }

    pub fn refund_tip(env: Env, lock_id: String, tipper: Address, nonce: u64) -> Result<(), Error> {
        tipper.require_auth();

        // Replay protection: check and update actor nonce
        let last_nonce: u64 = env
            .storage()
            .instance()
            .get(&types::DataKey::ActorNonce(tipper.clone()))
            .unwrap_or(0);
        if nonce <= last_nonce {
            return Err(Error::InvalidNonce);
        }
        env.storage()
            .instance()
            .set(&types::DataKey::ActorNonce(tipper.clone()), &nonce);

        let mut tip = storage::get_tip(&env, lock_id).ok_or(Error::LockNotFound)?;

        if tip.tipper != tipper {
            return Err(Error::Unauthorized);
        }

        if tip.status != TimeLockStatus::Locked {
            return Err(Error::AlreadyClaimedOrRefunded);
        }

        let current_time = env.ledger().timestamp();
        // Refund available 30 days after unlock_time
        let refund_delay = 30 * 24 * 60 * 60; // 30 days in seconds
        if current_time < tip.unlock_time + refund_delay {
            return Err(Error::RefundNotAvailableYet);
        }

        tip.status = TimeLockStatus::Refunded;
        storage::update_tip(&env, &tip);

        // Transfer funds back to tipper
        match &tip.asset {
            Asset::Token(token_address) => {
                let token_client = token::Client::new(&env, token_address);
                token_client.transfer(&env.current_contract_address(), &tipper, &tip.amount);
            }
        }

        // Emit canonical tip action event for refund (cancel)
        env.events().publish(
            (symbol_short!("TIP"), symbol_short!("CANCEL")),
            TipActionEvent::new(
                &env,
                "CANCEL",
                tip.lock_id.clone(),
                tip.tipper.clone(),
                tip.artist.clone(),
                tip.amount,
                None,
                None,
                tipper.clone(),
                "REFUNDED",
                Some(tip.unlock_time),
            ),
        );

        Ok(())
    }

    pub fn get_pending_tips(env: Env, artist: Address) -> Vec<TimeLockTip> {
        let tip_ids = storage::get_artist_tips(&env, artist);
        let mut pending = Vec::new(&env);
        for lock_id in tip_ids.iter() {
            if let Some(tip) = storage::get_tip(&env, lock_id) {
                if tip.status == TimeLockStatus::Locked {
                    pending.push_back(tip);
                }
            }
        }
        pending
    }
}
