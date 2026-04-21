#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};
mod error;
pub use error::Error;

#[contracttype]
#[derive(Clone)]
pub struct TrackAccess {
    pub track_id: String,
    pub artist: Address,
    pub min_tip_amount: i128,
    pub is_gated: bool,
    pub total_unlocks: u32,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct AccessGrant {
    pub track_id: String,
    pub listener: Address,
    pub unlocked_at: u64,
    pub tip_amount_paid: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Track(String),
    Grant(String, Address),
}

#[contract]
pub struct TrackAccessControl;

#[contractimpl]
impl TrackAccessControl {
    fn track_key(track_id: &String) -> DataKey {
        DataKey::Track(track_id.clone())
    }

    fn grant_key(track_id: &String, listener: &Address) -> DataKey {
        DataKey::Grant(track_id.clone(), listener.clone())
    }

    /// Artist sets a track gate
    pub fn set_track_access(
        env: Env,
        artist: Address,
        track_id: String,
        min_tip_amount: i128,
    ) -> Result<(), Error> {
        artist.require_auth();

        if let Some(existing) = env
            .storage()
            .persistent()
            .get::<_, TrackAccess>(&Self::track_key(&track_id))
        {
            if existing.artist != artist {
                return Err(Error::Unauthorized);
            }
        }

        let now = env.ledger().timestamp();
        let track = match env
            .storage()
            .persistent()
            .get::<_, TrackAccess>(&Self::track_key(&track_id))
        {
            Some(existing) => TrackAccess {
                track_id: track_id.clone(),
                artist: artist.clone(),
                min_tip_amount,
                is_gated: true,
                total_unlocks: existing.total_unlocks,
                created_at: existing.created_at,
            },
            None => TrackAccess {
                track_id: track_id.clone(),
                artist: artist.clone(),
                min_tip_amount,
                is_gated: true,
                total_unlocks: 0,
                created_at: now,
            },
        };

        env.storage()
            .persistent()
            .set(&Self::track_key(&track_id), &track);

        env.events().publish(
            (symbol_short!("track"), symbol_short!("set")),
            (track_id.clone(), min_tip_amount),
        );

        Ok(())
    }

    /// Unlock a track by tipping
    pub fn unlock_track(
        env: Env,
        listener: Address,
        track_id: String,
        tip_amount: i128,
    ) -> Result<bool, Error> {
        listener.require_auth();

        let mut track: TrackAccess = env
            .storage()
            .persistent()
            .get(&Self::track_key(&track_id))
            .ok_or(Error::TrackNotFound)?;

        if !track.is_gated {
            return Ok(true);
        }

        if tip_amount < track.min_tip_amount {
            return Err(Error::TipTooLow);
        }

        let grant_key = Self::grant_key(&track_id, &listener);
        if env.storage().persistent().has(&grant_key) {
            return Err(Error::AlreadyUnlocked);
        }

        let grant = AccessGrant {
            track_id: track_id.clone(),
            listener: listener.clone(),
            unlocked_at: env.ledger().timestamp(),
            tip_amount_paid: tip_amount,
        };

        env.storage().persistent().set(&grant_key, &grant);

        track.total_unlocks = track.total_unlocks.saturating_add(1);
        env.storage()
            .persistent()
            .set(&Self::track_key(&track_id), &track);

        env.events().publish(
            (symbol_short!("track"), symbol_short!("unlock")),
            (track_id.clone(), listener.clone(), tip_amount),
        );

        Ok(true)
    }

    /// Check if listener has access
    pub fn check_access(env: Env, listener: Address, track_id: String) -> bool {
        let track: TrackAccess = match env.storage().persistent().get(&Self::track_key(&track_id)) {
            Some(track) => track,
            None => return false,
        };

        if !track.is_gated {
            return true;
        }

        env.storage()
            .persistent()
            .has(&Self::grant_key(&track_id, &listener))
    }

    /// Remove a track gate
    pub fn remove_gate(env: Env, artist: Address, track_id: String) -> Result<(), Error> {
        artist.require_auth();

        let mut track: TrackAccess = env
            .storage()
            .persistent()
            .get(&Self::track_key(&track_id))
            .ok_or(Error::TrackNotFound)?;

        if track.artist != artist {
            return Err(Error::Unauthorized);
        }

        track.is_gated = false;
        env.storage()
            .persistent()
            .set(&Self::track_key(&track_id), &track);

        env.events().publish(
            (symbol_short!("track"), symbol_short!("remove")),
            (track_id.clone(),),
        );

        Ok(())
    }
}
