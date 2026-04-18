use soroban_sdk::{symbol_short, Address, Env, String};

pub fn emit_pool_created(env: &Env, pool_id: &String) {
    env.events().publish(
        (symbol_short!("pool"), symbol_short!("create")),
        pool_id.clone(),
    );
}

pub fn emit_tip_matched(env: &Env, pool_id: &String, tipper: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("tip"), symbol_short!("match")),
        (pool_id.clone(), tipper.clone(), amount),
    );
}

pub fn emit_pool_cancelled(env: &Env, pool_id: &String, refunded_amount: i128) {
    env.events().publish(
        (symbol_short!("pool"), symbol_short!("cancel")),
        (pool_id.clone(), refunded_amount),
    );
}
