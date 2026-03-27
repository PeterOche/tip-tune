#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger, token, Address, Env};

fn setup_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env
}

#[test]
fn test_set_mode_open() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    client.set_allowlist_mode(&artist, &AllowlistMode::Open);

    let config = client.get_config(&artist);
    assert_eq!(config.artist, artist);
    assert_eq!(config.mode, AllowlistMode::Open);
    assert_eq!(config.is_active, true);
    assert_eq!(config.created_at, 1000);
}

#[test]
fn test_set_mode_allowlist_only() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    client.set_allowlist_mode(&artist, &AllowlistMode::AllowlistOnly);

    let config = client.get_config(&artist);
    assert_eq!(config.mode, AllowlistMode::AllowlistOnly);
}

#[test]
fn test_mode_switching() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);

    client.set_allowlist_mode(&artist, &AllowlistMode::Open);
    assert_eq!(client.get_config(&artist).mode, AllowlistMode::Open);

    client.set_allowlist_mode(&artist, &AllowlistMode::AllowlistOnly);
    assert_eq!(
        client.get_config(&artist).mode,
        AllowlistMode::AllowlistOnly
    );

    client.set_allowlist_mode(&artist, &AllowlistMode::TokenGated);
    assert_eq!(client.get_config(&artist).mode, AllowlistMode::TokenGated);
}

#[test]
fn test_mode_switch_preserves_config() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    client.set_allowlist_mode(&artist, &AllowlistMode::Open);

    let original = client.get_config(&artist);

    client.set_allowlist_mode(&artist, &AllowlistMode::AllowlistOnly);
    let updated = client.get_config(&artist);

    assert_eq!(updated.artist, original.artist);
    assert_eq!(updated.is_active, original.is_active);
    assert_eq!(updated.created_at, original.created_at);
    assert_eq!(updated.mode, AllowlistMode::AllowlistOnly);
}

#[test]
fn test_add_to_allowlist() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.add_to_allowlist(&artist, &tipper);
    assert_eq!(client.is_on_allowlist(&artist, &tipper), true);
}

#[test]
fn test_add_duplicate_fails() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.add_to_allowlist(&artist, &tipper);
    let result = client.try_add_to_allowlist(&artist, &tipper);
    assert_eq!(result, Err(Ok(Error::AlreadyOnAllowlist)));
}

#[test]
fn test_remove_from_allowlist() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.add_to_allowlist(&artist, &tipper);
    assert_eq!(client.is_on_allowlist(&artist, &tipper), true);

    client.remove_from_allowlist(&artist, &tipper);
    assert_eq!(client.is_on_allowlist(&artist, &tipper), false);
}

#[test]
fn test_remove_nonexistent_fails() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    let result = client.try_remove_from_allowlist(&artist, &tipper);
    assert_eq!(result, Err(Ok(Error::NotOnAllowlist)));
}

#[test]
fn test_check_can_tip_open_mode() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.set_allowlist_mode(&artist, &AllowlistMode::Open);
    assert_eq!(client.check_can_tip(&artist, &tipper), true);
}

#[test]
fn test_check_can_tip_no_config_defaults_open() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    assert_eq!(client.check_can_tip(&artist, &tipper), true);
}

#[test]
fn test_check_can_tip_allowlist_only_allowed() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.set_allowlist_mode(&artist, &AllowlistMode::AllowlistOnly);
    client.add_to_allowlist(&artist, &tipper);

    assert_eq!(client.check_can_tip(&artist, &tipper), true);
}

#[test]
fn test_check_can_tip_allowlist_only_denied() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.set_allowlist_mode(&artist, &AllowlistMode::AllowlistOnly);
    assert_eq!(client.check_can_tip(&artist, &tipper), false);
}

#[test]
fn test_check_can_tip_token_gated_sufficient_balance() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let sac = token::StellarAssetClient::new(&env, &token_address);
    sac.mint(&tipper, &1000);

    client.set_allowlist_mode(&artist, &AllowlistMode::TokenGated);
    client.set_token_gate(&artist, &token_address, &500);

    assert_eq!(client.check_can_tip(&artist, &tipper), true);
}

#[test]
fn test_check_can_tip_token_gated_insufficient_balance() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let sac = token::StellarAssetClient::new(&env, &token_address);
    sac.mint(&tipper, &100);

    client.set_allowlist_mode(&artist, &AllowlistMode::TokenGated);
    client.set_token_gate(&artist, &token_address, &500);

    assert_eq!(client.check_can_tip(&artist, &tipper), false);
}

#[test]
fn test_check_can_tip_token_gated_exact_balance() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let sac = token::StellarAssetClient::new(&env, &token_address);
    sac.mint(&tipper, &500);

    client.set_allowlist_mode(&artist, &AllowlistMode::TokenGated);
    client.set_token_gate(&artist, &token_address, &500);

    assert_eq!(client.check_can_tip(&artist, &tipper), true);
}

#[test]
fn test_check_can_tip_token_gated_no_gate_config() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.set_allowlist_mode(&artist, &AllowlistMode::TokenGated);
    assert_eq!(client.check_can_tip(&artist, &tipper), false);
}

#[test]
fn test_set_token_gate_invalid_balance() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let token_address = Address::generate(&env);

    let result = client.try_set_token_gate(&artist, &token_address, &0);
    assert_eq!(result, Err(Ok(Error::InvalidTokenConfig)));

    let result = client.try_set_token_gate(&artist, &token_address, &-10);
    assert_eq!(result, Err(Ok(Error::InvalidTokenConfig)));
}

#[test]
fn test_config_not_found() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let result = client.try_get_config(&artist);
    assert_eq!(result, Err(Ok(Error::ConfigNotFound)));
}

#[test]
fn test_allowlist_add_remove_readd() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.add_to_allowlist(&artist, &tipper);
    assert_eq!(client.is_on_allowlist(&artist, &tipper), true);

    client.remove_from_allowlist(&artist, &tipper);
    assert_eq!(client.is_on_allowlist(&artist, &tipper), false);

    client.add_to_allowlist(&artist, &tipper);
    assert_eq!(client.is_on_allowlist(&artist, &tipper), true);
}

#[test]
fn test_multiple_artists_independent() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist1 = Address::generate(&env);
    let artist2 = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.set_allowlist_mode(&artist1, &AllowlistMode::AllowlistOnly);
    client.set_allowlist_mode(&artist2, &AllowlistMode::Open);

    client.add_to_allowlist(&artist1, &tipper);

    assert_eq!(client.check_can_tip(&artist1, &tipper), true);
    assert_eq!(client.check_can_tip(&artist2, &tipper), true);

    assert_eq!(client.is_on_allowlist(&artist2, &tipper), false);
}

// Batch operation tests
#[test]
fn test_batch_add_to_allowlist() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);
    let tipper3 = Address::generate(&env);

    let addresses = soroban_sdk::vec![&env, tipper1.clone(), tipper2.clone(), tipper3.clone()];
    
    client.add_batch_to_allowlist(&artist, &addresses);
    
    assert_eq!(client.is_on_allowlist(&artist, &tipper1), true);
    assert_eq!(client.is_on_allowlist(&artist, &tipper2), true);
    assert_eq!(client.is_on_allowlist(&artist, &tipper3), true);
}

#[test]
fn test_batch_add_empty_fails() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let addresses: Vec<Address> = soroban_sdk::vec![&env];

    let result = client.try_add_batch_to_allowlist(&artist, &addresses);
    assert_eq!(result, Err(Ok(Error::EmptyBatchOperation)));
}

#[test]
fn test_batch_add_with_duplicate_in_batch_fails() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    let addresses = soroban_sdk::vec![&env, tipper.clone(), tipper.clone()];
    
    let result = client.try_add_batch_to_allowlist(&artist, &addresses);
    assert_eq!(result, Err(Ok(Error::AlreadyOnAllowlist)));
}

#[test]
fn test_batch_add_with_existing_member_fails() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);
    let tipper3 = Address::generate(&env);

    // Add first member
    client.add_to_allowlist(&artist, &tipper1);

    // Try to batch add including already-existing member (atomicity check)
    let addresses = soroban_sdk::vec![&env, tipper2.clone(), tipper1.clone(), tipper3.clone()];
    
    let result = client.try_add_batch_to_allowlist(&artist, &addresses);
    assert_eq!(result, Err(Ok(Error::AlreadyOnAllowlist)));
    
    // Verify atomicity: tipper2 and tipper3 should NOT have been added
    assert_eq!(client.is_on_allowlist(&artist, &tipper2), false);
    assert_eq!(client.is_on_allowlist(&artist, &tipper3), false);
}

#[test]
fn test_batch_remove_from_allowlist() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);
    let tipper3 = Address::generate(&env);

    // Add all
    let addresses = soroban_sdk::vec![&env, tipper1.clone(), tipper2.clone(), tipper3.clone()];
    client.add_batch_to_allowlist(&artist, &addresses);

    // Remove some
    let remove_addresses = soroban_sdk::vec![&env, tipper1.clone(), tipper3.clone()];
    client.remove_batch_from_allowlist(&artist, &remove_addresses);

    assert_eq!(client.is_on_allowlist(&artist, &tipper1), false);
    assert_eq!(client.is_on_allowlist(&artist, &tipper2), true);
    assert_eq!(client.is_on_allowlist(&artist, &tipper3), false);
}

#[test]
fn test_batch_remove_empty_fails() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let addresses: Vec<Address> = soroban_sdk::vec![&env];

    let result = client.try_remove_batch_from_allowlist(&artist, &addresses);
    assert_eq!(result, Err(Ok(Error::EmptyBatchOperation)));
}

#[test]
fn test_batch_remove_nonexistent_fails() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);

    let addresses = soroban_sdk::vec![&env, tipper1.clone(), tipper2.clone()];
    
    let result = client.try_remove_batch_from_allowlist(&artist, &addresses);
    assert_eq!(result, Err(Ok(Error::NotOnAllowlist)));
}

#[test]
fn test_batch_remove_partial_atomicity() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);
    let tipper3 = Address::generate(&env);

    // Add tipper1 and tipper2
    let add_addresses = soroban_sdk::vec![&env, tipper1.clone(), tipper2.clone()];
    client.add_batch_to_allowlist(&artist, &add_addresses);

    // Try to batch remove including non-existent member (atomicity check)
    let remove_addresses = soroban_sdk::vec![&env, tipper1.clone(), tipper3.clone()];
    
    let result = client.try_remove_batch_from_allowlist(&artist, &remove_addresses);
    assert_eq!(result, Err(Ok(Error::NotOnAllowlist)));
    
    // Verify atomicity: tipper1 should still be there
    assert_eq!(client.is_on_allowlist(&artist, &tipper1), true);
    assert_eq!(client.is_on_allowlist(&artist, &tipper2), true);
}

// Token gate hardening tests
#[test]
fn test_get_token_gate_found() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();

    client.set_allowlist_mode(&artist, &AllowlistMode::TokenGated);
    client.set_token_gate(&artist, &token_address, &1000);

    let gate = client.get_token_gate(&artist);
    assert_eq!(gate.token_address, token_address);
    assert_eq!(gate.min_balance, 1000);
}

#[test]
fn test_get_token_gate_not_found() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);

    let result = client.try_get_token_gate(&artist);
    assert_eq!(result, Err(Ok(Error::TokenGateNotFound)));
}

#[test]
fn test_token_gate_validation_with_valid_token() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let token_admin = Address::generate(&env);

    // Create a valid stellar asset token
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();

    // Should succeed with valid token
    let result = client.try_set_token_gate(&artist, &token_address, &1000);
    assert_eq!(result, Ok(Ok(())));
}

#[test]
fn test_batch_add_then_remove_workflow() {
    let env = setup_env();
    let contract_id = env.register_contract(None, ArtistAllowlistContract);
    let client = ArtistAllowlistContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);
    let tipper3 = Address::generate(&env);
    let tipper4 = Address::generate(&env);

    client.set_allowlist_mode(&artist, &AllowlistMode::AllowlistOnly);

    // Batch add 4 tippers
    let add_addresses = soroban_sdk::vec![&env, tipper1.clone(), tipper2.clone(), tipper3.clone(), tipper4.clone()];
    client.add_batch_to_allowlist(&artist, &add_addresses);

    // All should be able to tip
    assert_eq!(client.check_can_tip(&artist, &tipper1), true);
    assert_eq!(client.check_can_tip(&artist, &tipper2), true);
    assert_eq!(client.check_can_tip(&artist, &tipper3), true);
    assert_eq!(client.check_can_tip(&artist, &tipper4), true);

    // Batch remove 2 tippers
    let remove_addresses = soroban_sdk::vec![&env, tipper2.clone(), tipper4.clone()];
    client.remove_batch_from_allowlist(&artist, &remove_addresses);

    // Check can tip results
    assert_eq!(client.check_can_tip(&artist, &tipper1), true);
    assert_eq!(client.check_can_tip(&artist, &tipper2), false);
    assert_eq!(client.check_can_tip(&artist, &tipper3), true);
    assert_eq!(client.check_can_tip(&artist, &tipper4), false);
}
