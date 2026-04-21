#![cfg(test)]

use drip_tip_matching::{PoolStatus, TipMatchingContract, TipMatchingContractClient};
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env};

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let sponsor = Address::generate(&env);
    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);
    let contract_id = env.register_contract(None, TipMatchingContract);

    (env, contract_id, sponsor, artist, tipper)
}

#[test]
fn test_matching_pool_lifecycle() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    let matched = client.apply_match(&pool_id, &100, &tipper);
    assert_eq!(matched, 100);

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.remaining_amount, 900);
    assert_eq!(pool.matched_amount, 100);
}

#[test]
fn test_apply_match_respects_ratio_and_cap() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &10_000,
        &50,
        &500,
        &(env.ledger().timestamp() + 1000),
    );

    assert_eq!(client.apply_match(&pool_id, &300, &tipper), 150);
    assert_eq!(client.apply_match(&pool_id, &1_000, &tipper), 350);

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.matched_amount, 500);
    assert_eq!(pool.remaining_amount, 9_500);
}

#[test]
fn test_apply_match_caps_to_remaining_budget() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &100,
        &100,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    let matched = client.apply_match(&pool_id, &200, &tipper);
    assert_eq!(matched, 100);

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.remaining_amount, 0);
}

#[test]
fn test_expired_pool_cannot_match() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(&sponsor, &artist, &1000, &100, &0, &1100);

    env.ledger().with_mut(|li| {
        li.timestamp = 1200;
    });

    assert!(client.try_apply_match(&pool_id, &100, &tipper).is_err());
    assert!(!client.is_pool_active(&pool_id));
}

#[test]
fn test_cancel_pool_returns_remaining_budget_once() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    client.apply_match(&pool_id, &250, &tipper);
    assert_eq!(client.cancel_pool(&pool_id, &sponsor), 750);
    assert!(client.try_cancel_pool(&pool_id, &sponsor).is_err());
}

#[test]
fn test_close_pool_after_exhaustion() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &100,
        &100,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    client.apply_match(&pool_id, &100, &tipper);
    client.close_pool(&pool_id);

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.status, PoolStatus::Closed);
}

#[test]
fn test_budget_accessors_track_pool_state() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    assert_eq!(client.get_remaining_budget(&pool_id), 1000);
    assert_eq!(client.get_matched_amount(&pool_id), 0);

    client.apply_match(&pool_id, &250, &tipper);
    assert_eq!(client.get_remaining_budget(&pool_id), 750);
    assert_eq!(client.get_matched_amount(&pool_id), 250);
}
