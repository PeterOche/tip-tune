#![cfg(test)]

use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env};
use tip_vault::{ReleaseFrequency, TipVaultContract, TipVaultContractClient, TipVaultError};

#[test]
fn test_vault_deposit_and_release() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let contract_id = env.register_contract(None, TipVaultContract);
    let client = TipVaultContractClient::new(&env, &contract_id);

    let vault_id = client.create_vault(&artist, &ReleaseFrequency::Weekly);

    client.deposit_to_vault(&vault_id, &1000);
    assert_eq!(client.get_vault_balance(&vault_id), 1000);

    let res = client.try_release_batch(&vault_id);
    assert_eq!(res, Err(Ok(TipVaultError::ReleaseTooEarly)));

    env.ledger().with_mut(|li| {
        li.timestamp += 7 * 24 * 60 * 60 + 1;
    });

    let released = client.release_batch(&vault_id);
    assert_eq!(released, 1000);
    assert_eq!(client.get_vault_balance(&vault_id), 0);
}

#[test]
fn test_only_owner_can_change_frequency() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let intruder = Address::generate(&env);
    let contract_id = env.register_contract(None, TipVaultContract);
    let client = TipVaultContractClient::new(&env, &contract_id);

    let vault_id = client.create_vault(&artist, &ReleaseFrequency::Monthly);
    let result = client.try_change_frequency(&intruder, &vault_id, &ReleaseFrequency::Instant);

    assert_eq!(result, Err(Ok(TipVaultError::NotVaultOwner)));
}
