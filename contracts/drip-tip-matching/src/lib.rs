#![no_std]

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, String};

mod errors;
mod events;
mod types;

pub use errors::Error;
pub use types::{MatchingPool, PoolStatus};

use types::DataKey;

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
    let mut i = buf.len();
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

fn load_pool(env: &Env, pool_id: &String) -> Result<MatchingPool, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Pool(pool_id.clone()))
        .ok_or(Error::PoolNotFound)
}

fn save_pool(env: &Env, pool: &MatchingPool) {
    env.storage()
        .persistent()
        .set(&DataKey::Pool(pool.pool_id.clone()), pool);
}

fn refresh_pool_status(env: &Env, pool: &mut MatchingPool) {
    if pool.status == PoolStatus::Active && env.ledger().timestamp() > pool.end_time {
        pool.status = PoolStatus::Expired;
    } else if pool.status == PoolStatus::Active
        && (pool.remaining_amount <= 0
            || (pool.match_cap_total > 0 && pool.matched_amount >= pool.match_cap_total))
    {
        pool.status = PoolStatus::Exhausted;
    }
}

#[contractimpl]
impl TipMatchingContract {
    pub fn create_matching_pool(
        env: Env,
        sponsor: Address,
        artist: Address,
        pool_amount: i128,
        match_ratio: u32,
        match_cap_total: i128,
        end_time: u64,
    ) -> Result<String, Error> {
        sponsor.require_auth();

        let now = env.ledger().timestamp();
        if pool_amount <= 0 || end_time <= now {
            return Err(Error::InvalidParameters);
        }
        if match_ratio == 0 {
            return Err(Error::InvalidMatchRatio);
        }
        if match_cap_total < 0 {
            return Err(Error::InvalidMatchCap);
        }

        let pool_id = next_pool_id(&env);
        let pool = MatchingPool {
            pool_id: pool_id.clone(),
            sponsor,
            artist,
            pool_amount,
            matched_amount: 0,
            remaining_amount: pool_amount,
            match_ratio,
            match_cap_total,
            start_time: now,
            end_time,
            status: PoolStatus::Active,
            created_at: now,
            refunded_at: 0,
        };

        save_pool(&env, &pool);
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

        let mut pool = load_pool(&env, &pool_id)?;
        refresh_pool_status(&env, &mut pool);

        if pool.status == PoolStatus::Expired {
            save_pool(&env, &pool);
            return Err(Error::PoolExpired);
        }
        if pool.status != PoolStatus::Active {
            return Err(Error::PoolNotActive);
        }
        if pool.remaining_amount <= 0 {
            pool.status = PoolStatus::Exhausted;
            save_pool(&env, &pool);
            return Err(Error::EmptyPool);
        }

        let mut actual_match = tip_amount
            .checked_mul(pool.match_ratio as i128)
            .ok_or(Error::InsufficientPoolAmount)?
            .checked_div(100)
            .ok_or(Error::InsufficientPoolAmount)?;

        if actual_match > pool.remaining_amount {
            actual_match = pool.remaining_amount;
        }

        if pool.match_cap_total > 0 {
            let max_allowed = pool
                .match_cap_total
                .checked_sub(pool.matched_amount)
                .ok_or(Error::MatchWouldExceedCap)?;
            if max_allowed <= 0 {
                pool.status = PoolStatus::Exhausted;
                save_pool(&env, &pool);
                return Err(Error::MatchWouldExceedCap);
            }
            if actual_match > max_allowed {
                actual_match = max_allowed;
            }
        }

        pool.matched_amount = pool
            .matched_amount
            .checked_add(actual_match)
            .ok_or(Error::InsufficientPoolAmount)?;
        pool.remaining_amount = pool
            .remaining_amount
            .checked_sub(actual_match)
            .ok_or(Error::InsufficientPoolAmount)?;
        refresh_pool_status(&env, &mut pool);
        save_pool(&env, &pool);

        env.events().publish(
            (symbol_short!("pool"), symbol_short!("match")),
            (pool_id.clone(), tipper.clone(), actual_match),
        );
        events::emit_tip_matched(&env, &pool_id, &tipper, actual_match);

        Ok(actual_match)
    }

    pub fn get_pool_status(env: Env, pool_id: String) -> Result<MatchingPool, Error> {
        let mut pool = load_pool(&env, &pool_id)?;
        refresh_pool_status(&env, &mut pool);
        save_pool(&env, &pool);
        Ok(pool)
    }

    pub fn cancel_pool(env: Env, pool_id: String, sponsor: Address) -> Result<i128, Error> {
        sponsor.require_auth();

        let mut pool = load_pool(&env, &pool_id)?;
        if pool.sponsor != sponsor {
            return Err(Error::Unauthorized);
        }
        if pool.refunded_at > 0 {
            return Err(Error::PoolAlreadyRefunded);
        }

        let refund = pool.remaining_amount;
        pool.remaining_amount = 0;
        pool.status = PoolStatus::Cancelled;
        pool.refunded_at = env.ledger().timestamp();
        save_pool(&env, &pool);

        events::emit_pool_cancelled(&env, &pool_id, refund);
        Ok(refund)
    }

    pub fn close_pool(env: Env, pool_id: String) -> Result<(), Error> {
        let mut pool = load_pool(&env, &pool_id)?;
        refresh_pool_status(&env, &mut pool);

        match pool.status {
            PoolStatus::Exhausted
            | PoolStatus::Expired
            | PoolStatus::Cancelled
            | PoolStatus::Closed => {
                pool.status = PoolStatus::Closed;
                save_pool(&env, &pool);
                Ok(())
            }
            PoolStatus::Active => Err(Error::InvalidCloseStatus),
        }
    }

    pub fn is_pool_active(env: Env, pool_id: String) -> Result<bool, Error> {
        let pool = Self::get_pool_status(env, pool_id)?;
        Ok(pool.status == PoolStatus::Active)
    }

    pub fn get_remaining_budget(env: Env, pool_id: String) -> Result<i128, Error> {
        Ok(Self::get_pool_status(env, pool_id)?.remaining_amount)
    }

    pub fn get_matched_amount(env: Env, pool_id: String) -> Result<i128, Error> {
        Ok(Self::get_pool_status(env, pool_id)?.matched_amount)
    }
}
