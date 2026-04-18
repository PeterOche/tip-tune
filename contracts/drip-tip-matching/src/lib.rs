#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, String};
mod errors;
mod events;
mod types;

use errors::Error;
use types::{DataKey, MatchingPool, PoolStatus};

#[contract]
pub struct TipMatchingContract;

fn next_pool_id(env: &Env) -> String {
    let count: u32 = env
        .storage()
        .instance()
        .get(&DataKey::PoolCount)
        .unwrap_or(0);
    let next = count + 1;
    env.storage().instance().set(&DataKey::PoolCount, &next);

    let mut buf = [0u8; 10];
    let mut i = 10;
    let mut n = next;

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

    String::from_bytes(env, &buf[i..])
}

#[contractimpl]
impl TipMatchingContract {
    pub fn create_matching_pool(
        env: Env,
        sponsor: Address,
        artist: Address,
        pool_amount: i128,
        match_ratio: u32,
        end_time: u64,
    ) -> Result<String, Error> {
        sponsor.require_auth();

        if pool_amount <= 0 || match_ratio == 0 || end_time <= env.ledger().timestamp() {
            return Err(Error::InvalidParameters);
        }

        let pool_id = next_pool_id(&env);
        let pool = MatchingPool {
            pool_id: pool_id.clone(),
            sponsor: sponsor.clone(),
            artist,
            pool_amount,
            remaining_amount: pool_amount,
            match_ratio,
            start_time: env.ledger().timestamp(),
            end_time,
            status: PoolStatus::Active,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Pool(pool_id.clone()), &pool);
        events::emit_pool_created(&env, &pool_id);
        Ok(pool_id)
    }

    pub fn apply_match(
        env: Env,
        pool_id: String,
        tip_amount: i128,
        tipper: Address,
    ) -> Result<i128, Error> {
        tipper.require_auth();

        if tip_amount <= 0 {
            return Err(Error::InvalidParameters);
        }

        let key = DataKey::Pool(pool_id.clone());
        let mut pool: MatchingPool = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PoolNotFound)?;

        let current_time = env.ledger().timestamp();
        if pool.status != PoolStatus::Active || current_time > pool.end_time {
            pool.status = PoolStatus::Expired;
            env.storage().persistent().set(&key, &pool);
            return Err(Error::PoolExpired);
        }

        let matched_amount = (tip_amount * pool.match_ratio as i128) / 100;
        let actual_match = if matched_amount > pool.remaining_amount {
            pool.remaining_amount
        } else {
            matched_amount
        };

        pool.remaining_amount -= actual_match;
        if pool.remaining_amount <= 0 {
            pool.status = PoolStatus::Exhausted;
        }

        env.storage().persistent().set(&key, &pool);
        events::emit_tip_matched(&env, &pool_id, &tipper, actual_match);
        Ok(actual_match)
    }

    pub fn get_pool_status(env: Env, pool_id: String) -> Result<MatchingPool, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Pool(pool_id))
            .ok_or(Error::PoolNotFound)
    }

    pub fn cancel_pool(env: Env, pool_id: String, sponsor: Address) -> Result<i128, Error> {
        sponsor.require_auth();

        let key = DataKey::Pool(pool_id.clone());
        let mut pool: MatchingPool = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PoolNotFound)?;

        if pool.sponsor != sponsor {
            return Err(Error::Unauthorized);
        }

        let refund = pool.remaining_amount;
        pool.remaining_amount = 0;
        pool.status = PoolStatus::Cancelled;

        env.storage().persistent().set(&key, &pool);
        events::emit_pool_cancelled(&env, &pool_id, refund);
        Ok(refund)
    }
}
