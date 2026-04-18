use drip_tip_matching::{TipMatchingContract, TipMatchingContractClient};
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env};

#[test]
fn test_matching_pool_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipMatchingContract);
    let client = TipMatchingContractClient::new(&env, &contract_id);

    let sponsor = Address::generate(&env);
    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);
    env.ledger().set_timestamp(1_000);

    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &(env.ledger().timestamp() + 1000),
    );

    let matched = client.apply_match(&pool_id, &100, &tipper);
    assert_eq!(matched, 100); // 1:1 match

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.remaining_amount, 900);
}

#[test]
fn test_apply_match_half_ratio() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        1000,
        50, // 1:2 match
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    let matched = TipMatchingContract::apply_match(
        env.clone(),
        pool_id.clone(),
        100,
        tipper.clone(),
    ).unwrap();

    assert_eq!(matched, 50);

    let pool = TipMatchingContract::get_pool_status(env, pool_id).unwrap();
    assert_eq!(pool.matched_amount, 50);
}

#[test]
fn test_apply_match_partial_when_insufficient_budget() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        100, // Only 100 available
        100, // 1:1 match
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    // Tip 200, but only 100 available in pool
    let matched = TipMatchingContract::apply_match(
        env.clone(),
        pool_id.clone(),
        200,
        tipper.clone(),
    ).unwrap();

    // Should match only what's available: 100
    assert_eq!(matched, 100);

    let pool = TipMatchingContract::get_pool_status(env, pool_id).unwrap();
    assert_eq!(pool.matched_amount, 100);
    assert_eq!(pool.remaining_amount, 0);
}

#[test]
fn test_apply_match_respects_cap() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        10000, // Plenty of budget
        100,   // 1:1 match
        500,   // But cap at 500 total matches
        env.ledger().timestamp() + 10000,
    ).unwrap();

    // First match: 300
    let matched1 = TipMatchingContract::apply_match(
        env.clone(),
        pool_id.clone(),
        300,
        tipper.clone(),
    ).unwrap();
    assert_eq!(matched1, 300);

    // Second match: 300 requested, but cap allows only 200 more
    let matched2 = TipMatchingContract::apply_match(
        env.clone(),
        pool_id.clone(),
        300,
        tipper.clone(),
    ).unwrap();
    assert_eq!(matched2, 200); // Capped

    let pool = TipMatchingContract::get_pool_status(env, pool_id).unwrap();
    assert_eq!(pool.matched_amount, 500);
}

#[test]
fn test_pool_depletes_to_exhausted() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        100,
        100, // 1:1 match
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    // Match exactly the pool amount
    let matched = TipMatchingContract::apply_match(
        env.clone(),
        pool_id.clone(),
        100,
        tipper.clone(),
    ).unwrap();
    assert_eq!(matched, 100);

    let pool = TipMatchingContract::get_pool_status(env.clone(), pool_id.clone()).unwrap();
    assert_eq!(pool.remaining_amount, 0);
    // Status should be Exhausted now

    // Try to match again - should fail
    let result = TipMatchingContract::apply_match(
        env,
        pool_id,
        50,
        tipper,
    );
    assert!(result.is_err());
}

#[test]
fn test_pool_expires() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let current_time = env.ledger().timestamp();
    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        1000,
        100,
        0,
        current_time + 100, // Expires soon
    ).unwrap();

    // Advance time past expiration
    env.ledger().with_mut(|li| {
        li.timestamp = current_time + 200;
    });

    // Matching should fail
    let result = TipMatchingContract::apply_match(
        env,
        pool_id,
        100,
        tipper,
    );
    assert!(result.is_err());
}

#[test]
fn test_cancel_pool_and_refund() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        1000,
        100,
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    // Do one match
    TipMatchingContract::apply_match(
        env.clone(),
        pool_id.clone(),
        200,
        tipper.clone(),
    ).unwrap();

    // Cancel and get refund
    let refund = TipMatchingContract::cancel_pool(
        env.clone(),
        pool_id.clone(),
        sponsor.clone(),
    ).unwrap();

    assert_eq!(refund, 800); // 1000 - 200 matched

    let pool = TipMatchingContract::get_pool_status(env.clone(), pool_id.clone()).unwrap();
    assert_eq!(pool.remaining_amount, 0);

    // Try to cancel again - should fail
    let result = TipMatchingContract::try_cancel_pool(env, pool_id, sponsor);
    assert!(result.is_err());
}

#[test]
fn test_cancel_pool_unauthorized() {
    let env = Env::default();
    let (env, sponsor, artist, _tipper) = setup_env_and_addresses(&env);

    let unauthorized = Accounts::generate(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        1000,
        100,
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    let result = TipMatchingContract::try_cancel_pool(
        env,
        pool_id,
        unauthorized.address.clone(),
    );
    assert!(result.is_err());
}

#[test]
fn test_close_pool_after_depletion() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        100,
        100,
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    // Deplete pool
    TipMatchingContract::apply_match(
        env.clone(),
        pool_id.clone(),
        100,
        tipper.clone(),
    ).unwrap();

    // Close depleted pool
    TipMatchingContract::close_pool(
        env.clone(),
        pool_id.clone(),
    ).unwrap();

    let pool = TipMatchingContract::get_pool_status(env, pool_id).unwrap();
    // Status should be Closed
}

#[test]
fn test_close_pool_after_expiration() {
    let env = Env::default();
    let (env, sponsor, artist, _tipper) = setup_env_and_addresses(&env);

    let current_time = env.ledger().timestamp();
    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        1000,
        100,
        0,
        current_time + 100,
    ).unwrap();

    // Advance past expiration
    env.ledger().with_mut(|li| {
        li.timestamp = current_time + 200;
    });

    // Close expired pool
    TipMatchingContract::close_pool(
        env.clone(),
        pool_id.clone(),
    ).unwrap();

    let pool = TipMatchingContract::get_pool_status(env, pool_id).unwrap();
    // Status should be Closed
}

#[test]
fn test_multiple_tips_accumulate() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        1000,
        100,
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    // Multiple tippers match
    for i in 0..5 {
        TipMatchingContract::apply_match(
            env.clone(),
            pool_id.clone(),
            100,
            tipper.clone(),
        ).unwrap();
    }

    let pool = TipMatchingContract::get_pool_status(env, pool_id).unwrap();
    assert_eq!(pool.matched_amount, 500);
    assert_eq!(pool.remaining_amount, 500);
}

#[test]
fn test_is_pool_active() {
    let env = Env::default();
    let (env, sponsor, artist, _tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        1000,
        100,
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    assert_eq!(TipMatchingContract::is_pool_active(env.clone(), pool_id.clone()).unwrap(), true);
}

#[test]
fn test_get_budget_functions() {
    let env = Env::default();
    let (env, sponsor, artist, tipper) = setup_env_and_addresses(&env);

    let pool_id = TipMatchingContract::create_matching_pool(
        env.clone(),
        sponsor.clone(),
        artist.clone(),
        1000,
        100,
        0,
        env.ledger().timestamp() + 10000,
    ).unwrap();

    assert_eq!(TipMatchingContract::get_remaining_budget(env.clone(), pool_id.clone()).unwrap(), 1000);
    assert_eq!(TipMatchingContract::get_matched_amount(env.clone(), pool_id.clone()).unwrap(), 0);

    TipMatchingContract::apply_match(
        env.clone(),
        pool_id.clone(),
        250,
        tipper.clone(),
    ).unwrap();

    let refund = client.cancel_pool(&pool_id, &sponsor);
    assert_eq!(refund, 900);
}
