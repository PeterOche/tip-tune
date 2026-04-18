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
    /// Create a new matching pool with sponsor funding.
    /// 
    /// # Arguments
    /// * `sponsor` - The address funding the matching pool
    /// * `artist` - The recipient benefiting from the matches
    /// * `pool_amount` - Total amount sponsor contributes (sponsor's budget)
    /// * `match_ratio` - Match ratio (100 = 1:1, 50 = 1:2, etc.)
    /// * `match_cap_total` - Maximum total amount to match (0 for unlimited)
    /// * `end_time` - Timestamp when pool expires
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

        if pool_amount <= 0 || match_ratio == 0 || end_time <= env.ledger().timestamp() {
            return Err(Error::InvalidParameters);
        }
        if match_ratio == 0 {
            return Err(Error::InvalidMatchRatio);
        }
        if match_cap_total != 0 && match_cap_total < pool_amount {
            return Err(Error::InvalidMatchCap);
        }
        if end_time <= env.ledger().timestamp() {
            return Err(Error::InvalidParameters);
        }

        // Generate unique pool ID from timestamp and sponsor
        let mut pool_id_data = sponsor.0.to_bytes();
        pool_id_data.append(&mut env.ledger().timestamp().to_be_bytes().into());
        let pool_id = env.crypto().sha256(&pool_id_data);

        let pool_id = next_pool_id(&env);
        let pool = MatchingPool {
            pool_id: pool_id.clone(),
            sponsor: sponsor.clone(),
            artist: artist.clone(),
            pool_amount,
            matched_amount: 0,
            remaining_amount: pool_amount,
            match_ratio,
            match_cap_total,
            start_time: env.ledger().timestamp(),
            end_time,
            status: PoolStatus::Active,
            created_at: env.ledger().timestamp(),
            refunded_at: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Pool(pool_id.clone()), &pool);
        events::emit_pool_created(&env, &pool_id);
        Ok(pool_id)
    }

    /// Apply matching to a tip.
    /// Calculates matched amount based on pool's ratio, cap, and available funds.
    /// Enforces guardrails to prevent overmatching.
    pub fn apply_match(
        env: Env,
        pool_id: Vec<u8>,
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

        // Check pool status and timing
        let current_time = env.ledger().timestamp();
        if current_time > pool.end_time {
            pool.status = PoolStatus::Expired;
            env.storage().persistent().set(&key, &pool);
            return Err(Error::PoolExpired);
        }

        if pool.status != PoolStatus::Active {
            return Err(Error::PoolNotActive);
        }

        if pool.remaining_amount <= 0 {
            pool.status = PoolStatus::Exhausted;
            env.storage().persistent().set(&DataKey::Pool(pool_id.clone()), &pool);
            emit_pool_depleted(&env, &pool_id, symbol_short!("exhausted"), pool.matched_amount);
            return Err(Error::EmptyPool);
        }

        // Calculate match amount from tip
        let matched_amount = (tip_amount as i128)
            .checked_mul(pool.match_ratio as i128)
            .ok_or(Error::InsufficientPoolAmount)?
            .checked_div(100)
            .ok_or(Error::InsufficientPoolAmount)?;

        // Apply cap constraints
        let mut actual_match = matched_amount;

        // Constraint 1: Cannot exceed remaining sponsor budget
        if actual_match > pool.remaining_amount {
            actual_match = pool.remaining_amount;
        }

        // Constraint 2: Cannot exceed total match cap if configured
        if pool.match_cap_total > 0 {
            let max_allowed = pool.match_cap_total
                .checked_sub(pool.matched_amount)
                .ok_or(Error::MatchWouldExceedCap)?;
            if actual_match > max_allowed {
                // Would exceed cap
                if max_allowed <= 0 {
                    pool.status = PoolStatus::Exhausted;
                    env.storage().persistent().set(&DataKey::Pool(pool_id.clone()), &pool);
                    emit_pool_depleted(&env, &pool_id, symbol_short!("capped"), pool.matched_amount);
                    return Err(Error::MatchWouldExceedCap);
                }
                actual_match = max_allowed;
            }
        }

        // Update pool accounting
        pool.matched_amount = pool.matched_amount
            .checked_add(actual_match)
            .ok_or(Error::InsufficientPoolAmount)?;
        pool.remaining_amount = pool.remaining_amount
            .checked_sub(actual_match)
            .ok_or(Error::InsufficientPoolAmount)?;

        // Check if pool is now exhausted
        if pool.remaining_amount <= 0 || (pool.match_cap_total > 0 && pool.matched_amount >= pool.match_cap_total) {
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

        let mut pool: MatchingPool = env
            .storage()
            .persistent()
            .get(&DataKey::Pool(pool_id.clone()))
            .ok_or(Error::PoolNotFound)?;

        // Verify sponsor authorization
        if pool.sponsor != sponsor {
            return Err(Error::Unauthorized);
        }

        // Check if already refunded
        if pool.refunded_at > 0 {
            return Err(Error::PoolAlreadyRefunded);
        }

        let refund = pool.remaining_amount;
        pool.remaining_amount = 0;
        pool.status = PoolStatus::Cancelled;
        pool.refunded_at = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Pool(pool_id.clone()), &pool);

        emit_pool_cancelled(&env, &pool_id, refund, pool.matched_amount);

        env.storage().persistent().set(&key, &pool);
        events::emit_pool_cancelled(&env, &pool_id, refund);
        Ok(refund)
    }
}
