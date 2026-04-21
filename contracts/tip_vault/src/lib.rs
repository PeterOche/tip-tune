#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};
mod error;
pub use error::TipVaultError;

const WEEK_IN_SECONDS: u64 = 7 * 24 * 60 * 60;
const MONTH_IN_SECONDS: u64 = 30 * 24 * 60 * 60;

#[contracttype]
#[derive(Clone)]
pub enum ReleaseFrequency {
    Instant,
    Weekly,
    Monthly,
}

#[contracttype]
#[derive(Clone)]
pub struct TipVault {
    pub vault_id: String,
    pub artist: Address,
    pub locked_amount: i128,
    pub release_frequency: ReleaseFrequency,
    pub next_release: u64,
    pub total_released: i128,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct VaultRelease {
    pub vault_id: String,
    pub amount: i128,
    pub released_at: u64,
    pub tx_hash: String,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Vault(String),
    VaultCount,
}

#[contract]
pub struct TipVaultContract;

fn next_vault_id(env: &Env) -> String {
    let next: u32 = env
        .storage()
        .instance()
        .get(&DataKey::VaultCount)
        .unwrap_or(0)
        + 1;
    env.storage().instance().set(&DataKey::VaultCount, &next);

    let mut digits = [0u8; 10];
    let mut i = digits.len();
    let mut n = next;

    if n == 0 {
        i -= 1;
        digits[i] = b'0';
    } else {
        while n > 0 {
            i -= 1;
            digits[i] = b'0' + (n % 10) as u8;
            n /= 10;
        }
    }

    let digits = &digits[i..];
    let mut id = [0u8; 16];
    id[..6].copy_from_slice(b"vault-");
    id[6..6 + digits.len()].copy_from_slice(digits);

    String::from_bytes(env, &id[..6 + digits.len()])
}

fn next_release_at(now: u64, frequency: &ReleaseFrequency) -> Result<u64, TipVaultError> {
    match frequency {
        ReleaseFrequency::Instant => Ok(now),
        ReleaseFrequency::Weekly => now
            .checked_add(WEEK_IN_SECONDS)
            .ok_or(TipVaultError::TimestampOverflow),
        ReleaseFrequency::Monthly => now
            .checked_add(MONTH_IN_SECONDS)
            .ok_or(TipVaultError::TimestampOverflow),
    }
}

#[contractimpl]
impl TipVaultContract {
    pub fn create_vault(
        env: Env,
        artist: Address,
        frequency: ReleaseFrequency,
    ) -> Result<String, TipVaultError> {
        artist.require_auth();

        let now = env.ledger().timestamp();
        let vault_id = next_vault_id(&env);
        let vault = TipVault {
            vault_id: vault_id.clone(),
            artist: artist.clone(),
            locked_amount: 0,
            release_frequency: frequency.clone(),
            next_release: next_release_at(now, &frequency)?,
            total_released: 0,
            is_active: true,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Vault(vault_id.clone()), &vault);
        env.events().publish(
            (symbol_short!("vault"), symbol_short!("create")),
            (vault_id.clone(), artist),
        );

        Ok(vault_id)
    }

    pub fn deposit_to_vault(env: Env, vault_id: String, amount: i128) -> Result<(), TipVaultError> {
        if amount <= 0 {
            return Err(TipVaultError::InsufficientBalance);
        }

        let mut vault: TipVault = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(vault_id.clone()))
            .ok_or(TipVaultError::VaultNotFound)?;
        vault.locked_amount = vault
            .locked_amount
            .checked_add(amount)
            .ok_or(TipVaultError::Overflow)?;
        env.storage()
            .persistent()
            .set(&DataKey::Vault(vault_id.clone()), &vault);
        env.events().publish(
            (symbol_short!("vault"), symbol_short!("deposit")),
            (vault_id, amount),
        );
        Ok(())
    }

    pub fn release_batch(env: Env, vault_id: String) -> Result<i128, TipVaultError> {
        let mut vault: TipVault = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(vault_id.clone()))
            .ok_or(TipVaultError::VaultNotFound)?;
        if !vault.is_active {
            return Err(TipVaultError::VaultNotFound);
        }

        let now = env.ledger().timestamp();
        if now < vault.next_release {
            return Err(TipVaultError::ReleaseTooEarly);
        }

        let amount_to_release = vault.locked_amount;
        vault.locked_amount = 0;
        vault.total_released = vault
            .total_released
            .checked_add(amount_to_release)
            .ok_or(TipVaultError::Overflow)?;

        vault.next_release = next_release_at(now, &vault.release_frequency)?;

        env.storage()
            .persistent()
            .set(&DataKey::Vault(vault_id.clone()), &vault);
        env.events().publish(
            (symbol_short!("vault"), symbol_short!("release")),
            (vault_id, amount_to_release),
        );

        Ok(amount_to_release)
    }

    pub fn get_vault_balance(env: Env, vault_id: String) -> Result<i128, TipVaultError> {
        let vault: TipVault = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(vault_id))
            .ok_or(TipVaultError::VaultNotFound)?;
        Ok(vault.locked_amount)
    }

    pub fn change_frequency(
        env: Env,
        artist: Address,
        vault_id: String,
        new_frequency: ReleaseFrequency,
    ) -> Result<(), TipVaultError> {
        artist.require_auth();

        let mut vault: TipVault = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(vault_id.clone()))
            .ok_or(TipVaultError::VaultNotFound)?;
        if vault.artist != artist {
            return Err(TipVaultError::NotVaultOwner);
        }
        vault.release_frequency = new_frequency.clone();
        vault.next_release = next_release_at(env.ledger().timestamp(), &new_frequency)?;
        env.storage()
            .persistent()
            .set(&DataKey::Vault(vault_id), &vault);
        Ok(())
    }
}
