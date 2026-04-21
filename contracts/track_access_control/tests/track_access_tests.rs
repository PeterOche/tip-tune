#![cfg(test)]
use soroban_sdk::{testutils::Address as _, Address, Env, String};
use track_access_control::{Error, TrackAccessControl, TrackAccessControlClient};

#[test]
fn test_track_gate_and_unlock() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let listener = Address::generate(&env);
    let contract_id = env.register_contract(None, TrackAccessControl);
    let client = TrackAccessControlClient::new(&env, &contract_id);
    let track_id = String::from_str(&env, "track1");

    client.set_track_access(&artist, &track_id, &50);

    let result = client.try_unlock_track(&listener, &track_id, &30);
    assert_eq!(result, Err(Ok(Error::TipTooLow)));

    assert!(client.unlock_track(&listener, &track_id, &50));

    assert!(client.check_access(&listener, &track_id));

    client.remove_gate(&artist, &track_id);
    let another_listener = Address::generate(&env);
    assert!(client.check_access(&another_listener, &track_id));
}

#[test]
fn test_only_track_owner_can_update_gate() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let other_artist = Address::generate(&env);
    let contract_id = env.register_contract(None, TrackAccessControl);
    let client = TrackAccessControlClient::new(&env, &contract_id);
    let track_id = String::from_str(&env, "track2");

    client.set_track_access(&artist, &track_id, &100);

    let result = client.try_set_track_access(&other_artist, &track_id, &200);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}
