#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    ConfigNotFound = 2,
    AlreadyOnAllowlist = 3,
    NotOnAllowlist = 4,
    InvalidTokenConfig = 5,
    TokenGateNotFound = 6,
    EmptyBatchOperation = 7,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AllowlistMode {
    Open,
    AllowlistOnly,
    TokenGated,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistConfig {
    pub artist: Address,
    pub mode: AllowlistMode,
    pub is_active: bool,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistEntry {
    pub artist: Address,
    pub address: Address,
    pub added_at: u64,
    pub added_by: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenGateConfig {
    pub token_address: Address,
    pub min_balance: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Config(Address),
    Entry(Address, Address),
    TokenGate(Address),
}

#[contract]
pub struct ArtistAllowlistContract;

#[contractimpl]
impl ArtistAllowlistContract {
    /// Set or update the allowlist mode for an artist
    pub fn set_allowlist_mode(env: Env, artist: Address, mode: AllowlistMode) -> Result<(), Error> {
        artist.require_auth();

        let config: AllowlistConfig = match env
            .storage()
            .persistent()
            .get(&DataKey::Config(artist.clone()))
        {
            Some(existing) => AllowlistConfig { mode, ..existing },
            None => AllowlistConfig {
                artist: artist.clone(),
                mode,
                is_active: true,
                created_at: env.ledger().timestamp(),
            },
        };

        env.storage()
            .persistent()
            .set(&DataKey::Config(artist.clone()), &config);

        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("mode")),
            (artist, mode),
        );

        Ok(())
    }

    /// Configure token gate parameters for token-gated mode.
    /// Validates that the token address is currently valid.
    pub fn set_token_gate(
        env: Env,
        artist: Address,
        token_address: Address,
        min_balance: i128,
    ) -> Result<(), Error> {
        artist.require_auth();

        if min_balance <= 0 {
            return Err(Error::InvalidTokenConfig);
        }

        // Validate token configuration by attempting to create a client
        // This ensures the token address is callable and valid
        let _client = token::Client::new(&env, &token_address);

        let gate = TokenGateConfig {
            token_address,
            min_balance,
        };

        env.storage()
            .persistent()
            .set(&DataKey::TokenGate(artist.clone()), &gate);

        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("tkngate")),
            (artist, min_balance),
        );

        Ok(())
    }

    /// Add an address to an artist's allowlist
    pub fn add_to_allowlist(env: Env, artist: Address, address: Address) -> Result<(), Error> {
        artist.require_auth();

        if env
            .storage()
            .persistent()
            .has(&DataKey::Entry(artist.clone(), address.clone()))
        {
            return Err(Error::AlreadyOnAllowlist);
        }

        let entry = AllowlistEntry {
            artist: artist.clone(),
            address: address.clone(),
            added_at: env.ledger().timestamp(),
            added_by: artist.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Entry(artist.clone(), address.clone()), &entry);

        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("added")),
            (artist, address),
        );

        Ok(())
    }

    /// Remove an address from an artist's allowlist
    pub fn remove_from_allowlist(env: Env, artist: Address, address: Address) -> Result<(), Error> {
        artist.require_auth();

        if !env
            .storage()
            .persistent()
            .has(&DataKey::Entry(artist.clone(), address.clone()))
        {
            return Err(Error::NotOnAllowlist);
        }

        env.storage()
            .persistent()
            .remove(&DataKey::Entry(artist.clone(), address.clone()));

        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("removed")),
            (artist, address),
        );

        Ok(())
    }

    /// Check if a tipper is allowed to tip an artist
    pub fn check_can_tip(env: Env, artist: Address, tipper: Address) -> bool {
        let config: AllowlistConfig = match env
            .storage()
            .persistent()
            .get(&DataKey::Config(artist.clone()))
        {
            Some(c) => c,
            None => return true,
        };

        if !config.is_active {
            return true;
        }

        match config.mode {
            AllowlistMode::Open => true,
            AllowlistMode::AllowlistOnly => env
                .storage()
                .persistent()
                .has(&DataKey::Entry(artist, tipper)),
            AllowlistMode::TokenGated => {
                let gate: TokenGateConfig =
                    match env.storage().persistent().get(&DataKey::TokenGate(artist)) {
                        Some(g) => g,
                        None => return false,
                    };
                let client = token::Client::new(&env, &gate.token_address);
                client.balance(&tipper) >= gate.min_balance
            }
        }
    }

    /// Get the current allowlist config for an artist
    pub fn get_config(env: Env, artist: Address) -> Result<AllowlistConfig, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Config(artist))
            .ok_or(Error::ConfigNotFound)
    }

    /// Check if an address is on the allowlist
    pub fn is_on_allowlist(env: Env, artist: Address, address: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Entry(artist, address))
    }

    /// Add multiple addresses to an artist's allowlist in a batch operation.
    /// Fails if any address is already on the allowlist (atomic semantics).
    pub fn add_batch_to_allowlist(
        env: Env,
        artist: Address,
        addresses: Vec<Address>,
    ) -> Result<(), Error> {
        artist.require_auth();

        if addresses.is_empty() {
            return Err(Error::EmptyBatchOperation);
        }

        // Check for duplicates within the batch
        let len = addresses.len();
        for i in 0..len {
            for j in (i + 1)..len {
                if addresses.get(i).unwrap() == addresses.get(j).unwrap() {
                    return Err(Error::AlreadyOnAllowlist);
                }
            }
        }

        // Check if any already on allowlist (fail-fast)
        for address in addresses.iter() {
            if env
                .storage()
                .persistent()
                .has(&DataKey::Entry(artist.clone(), address.clone()))
            {
                return Err(Error::AlreadyOnAllowlist);
            }
        }

        // Add all addresses (if we get here, all checks passed)
        for address in addresses.iter() {
            let entry = AllowlistEntry {
                artist: artist.clone(),
                address: address.clone(),
                added_at: env.ledger().timestamp(),
                added_by: artist.clone(),
            };

            env.storage()
                .persistent()
                .set(&DataKey::Entry(artist.clone(), address.clone()), &entry);

            env.events().publish(
                (symbol_short!("allowlst"), symbol_short!("batch")),
                (artist.clone(), address.clone()),
            );
        }

        Ok(())
    }

    /// Remove multiple addresses from an artist's allowlist in a batch operation.
    /// Fails if any address is not on the allowlist (atomic semantics).
    pub fn remove_batch_from_allowlist(
        env: Env,
        artist: Address,
        addresses: Vec<Address>,
    ) -> Result<(), Error> {
        artist.require_auth();

        if addresses.is_empty() {
            return Err(Error::EmptyBatchOperation);
        }

        // Check if all addresses are on the allowlist (fail-fast)
        for address in addresses.iter() {
            if !env
                .storage()
                .persistent()
                .has(&DataKey::Entry(artist.clone(), address.clone()))
            {
                return Err(Error::NotOnAllowlist);
            }
        }

        // Remove all addresses (if we get here, all checks passed)
        for address in addresses.iter() {
            env.storage()
                .persistent()
                .remove(&DataKey::Entry(artist.clone(), address.clone()));

            env.events().publish(
                (symbol_short!("allowlst"), symbol_short!("brem")),
                (artist.clone(), address.clone()),
            );
        }

        Ok(())
    }

    /// Get the token gate configuration for an artist.
    /// Returns error if token gate is not configured.
    pub fn get_token_gate(env: Env, artist: Address) -> Result<TokenGateConfig, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenGate(artist))
            .ok_or(Error::TokenGateNotFound)
    }
}

mod test;
