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

    let refund = client.cancel_pool(&pool_id, &sponsor);
    assert_eq!(refund, 900);
}
