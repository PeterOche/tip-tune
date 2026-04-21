#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env};

fn register_client<'a>(env: &'a Env) -> RewardTokenClient<'a> {
    let contract_id = env.register_contract(None, RewardToken);
    RewardTokenClient::new(env, &contract_id)
}

#[test]
fn test_basic_operations() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Initialize without supply cap
    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    assert_eq!(client.balance(&admin), 1000);
    assert_eq!(client.balance(&user1), 0);
    assert_eq!(client.total_supply(), 1000);
    assert_eq!(client.supply_cap(), None);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.is_paused(), false);

    // Transfer by admin
    client.transfer(&admin, &user1, &100);
    assert_eq!(client.balance(&admin), 900);
    assert_eq!(client.balance(&user1), 100);
    assert_eq!(client.total_supply(), 1000);

    // Transfer by user
    client.transfer(&user1, &user2, &50);
    assert_eq!(client.balance(&user1), 50);
    assert_eq!(client.balance(&user2), 50);
    assert_eq!(client.total_supply(), 1000);

    // Mint reward
    client.mint_reward(&user1, &200);
    assert_eq!(client.balance(&user1), 250);
    assert_eq!(client.total_supply(), 1200);

    // Burn
    client.burn(&user1, &50);
    assert_eq!(client.balance(&user1), 200);
    assert_eq!(client.total_supply(), 1150);

    // Approve and TransferFrom
    client.approve(&user1, &user2, &100);
    assert_eq!(client.allowance(&user1, &user2), 100);

    client.transfer_from(&user2, &user1, &admin, &50);
    assert_eq!(client.balance(&user1), 150);
    assert_eq!(client.balance(&admin), 950);
    assert_eq!(client.allowance(&user1, &user2), 50);
    assert_eq!(client.total_supply(), 1150);
}

#[test]
fn test_supply_cap() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();

    // Initialize with supply cap
    client.initialize(&admin, &1000, &Some(2000));
    assert_eq!(client.supply_cap(), Some(2000));
    assert_eq!(client.total_supply(), 1000);

    // Should be able to mint up to the cap
    client.mint_reward(&user1, &900);
    assert_eq!(client.balance(&user1), 900);
    assert_eq!(client.total_supply(), 1900);
}

#[test]
#[should_panic]
fn test_supply_cap_panics_when_exceeded() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &Some(2000));
    client.mint_reward(&user1, &900);

    client.mint_reward(&user1, &200);
}

#[test]
#[should_panic]
fn test_supply_cap_validation_on_init() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &2000, &Some(1000));
}

#[test]
fn test_pause_functionality() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    assert_eq!(client.is_paused(), false);
    client.pause();
    assert_eq!(client.is_paused(), true);
    client.unpause();
    assert_eq!(client.is_paused(), false);
    client.transfer(&admin, &user1, &100);
    assert_eq!(client.balance(&user1), 100);
}

#[test]
#[should_panic]
fn test_transfer_panics_while_paused() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);
    client.pause();

    client.transfer(&admin, &user1, &100);
}

#[test]
#[should_panic]
fn test_mint_panics_while_paused() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);
    client.pause();

    client.mint_reward(&user1, &100);
}

#[test]
fn test_admin_transfer() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    // Give some tokens to user1
    client.transfer(&admin, &user1, &500);
    assert_eq!(client.balance(&user1), 500);

    // Admin can transfer user1's tokens to user2
    client.admin_transfer(&user1, &user2, &300);
    assert_eq!(client.balance(&user1), 200);
    assert_eq!(client.balance(&user2), 300);

    // Total supply should remain the same
    assert_eq!(client.total_supply(), 1000);
}

#[test]
fn test_allowance_edge_cases() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    // Transfer tokens to user1
    client.transfer(&admin, &user1, &500);

    // Approve exactly the balance
    client.approve(&user1, &user2, &500);
    assert_eq!(client.allowance(&user1, &user2), 500);

    // Used exactly the allowance
    client.transfer_from(&user2, &user1, &admin, &500);
    assert_eq!(client.balance(&user1), 0);
    assert_eq!(client.allowance(&user1, &user2), 0);
}

#[test]
#[should_panic]
fn test_transfer_from_panics_without_allowance() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);
    client.transfer(&admin, &user1, &500);
    client.approve(&user1, &user2, &500);
    client.transfer_from(&user2, &user1, &admin, &500);

    client.transfer_from(&user2, &user1, &admin, &1);
}

#[test]
fn test_zero_approve_clears_allowance() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);
    client.approve(&admin, &user1, &100);
    client.approve(&admin, &user1, &0);

    assert_eq!(client.allowance(&admin, &user1), 0);
}

#[test]
#[should_panic]
fn test_zero_transfer_panics() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    client.transfer(&admin, &user1, &0);
}

#[test]
#[should_panic]
fn test_negative_transfer_panics() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    client.transfer(&admin, &user1, &-100);
}

#[test]
#[should_panic]
fn test_zero_mint_panics() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    client.mint_reward(&user1, &0);
}

#[test]
#[should_panic]
fn test_zero_burn_panics() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);
    client.transfer(&admin, &user1, &100);

    client.burn(&user1, &0);
}

#[test]
fn test_burn_reduces_supply() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    assert_eq!(client.total_supply(), 1000);

    client.transfer(&admin, &user1, &400);
    client.burn(&user1, &200);

    assert_eq!(client.balance(&user1), 200);
    assert_eq!(client.total_supply(), 800);
    assert_eq!(client.balance(&admin), 600);
}

#[test]
#[should_panic]
fn test_transfer_to_self_panics() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    client.transfer(&admin, &admin, &100);
}

#[test]
#[should_panic]
fn test_approve_self_panics() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);

    client.approve(&admin, &admin, &100);
}

#[test]
#[should_panic]
fn test_transfer_panics_with_insufficient_balance() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);
    client.transfer(&admin, &user1, &100);

    client.transfer(&user1, &user2, &200);
}

#[test]
#[should_panic]
fn test_transfer_from_panics_with_insufficient_allowance() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);
    client.transfer(&admin, &user1, &100);
    client.approve(&user1, &user2, &100);

    client.transfer_from(&user2, &user1, &admin, &150);
}

#[test]
#[should_panic]
fn test_transfer_from_panics_with_insufficient_balance() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1000, &None);
    client.transfer(&admin, &user1, &100);
    client.approve(&user1, &user2, &150);

    client.transfer_from(&user2, &user1, &admin, &150);
}

#[test]
fn test_multiple_operations_consistency() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &10000, &Some(15000));

    client.transfer(&admin, &user1, &3000);
    client.transfer(&admin, &user2, &2000);
    client.mint_reward(&user3, &1000);

    assert_eq!(client.total_supply(), 11000);
    assert_eq!(client.balance(&admin), 5000);
    assert_eq!(client.balance(&user1), 3000);
    assert_eq!(client.balance(&user2), 2000);
    assert_eq!(client.balance(&user3), 1000);

    client.approve(&user1, &user2, &2000);
    client.transfer_from(&user2, &user1, &user3, &1000);

    assert_eq!(client.balance(&user1), 2000);
    assert_eq!(client.balance(&user3), 2000);
    assert_eq!(client.allowance(&user1, &user2), 1000);
    assert_eq!(client.total_supply(), 11000);

    client.burn(&user1, &500);
    assert_eq!(client.balance(&user1), 1500);
    assert_eq!(client.total_supply(), 10500);
}

#[test]
#[should_panic]
fn test_multiple_operations_panics_when_exceeding_supply_cap() {
    let env = Env::default();
    let client = register_client(&env);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &10000, &Some(15000));
    client.mint_reward(&user1, &1000);

    client.mint_reward(&user1, &5000);
}
