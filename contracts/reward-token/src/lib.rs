#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    TotalSupply,
    Balance(Address),
    Allowance(Address, Address), // from, spender
    SupplyCap,
    Paused,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferEvent {
    pub from: Address,
    pub to: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintEvent {
    pub recipient: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BurnEvent {
    pub from: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminTransferEvent {
    pub from: Address,
    pub to: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseEvent {
    pub paused: bool,
}

#[contract]
pub struct RewardToken;

#[contractimpl]
impl RewardToken {
    /// Initialize the reward token with admin, total supply, and optional supply cap.
    /// 
    /// # Arguments
    /// * `admin` - The admin address with administrative privileges
    /// * `total_supply` - Initial total supply (all minted to admin)
    /// * `supply_cap` - Maximum allowed total supply (None for unlimited, Some for capped)
    pub fn initialize(env: Env, admin: Address, total_supply: i128, supply_cap: Option<i128>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        if total_supply < 0 {
            panic!("Total supply cannot be negative");
        }
        
        // Validate supply cap if provided
        if let Some(cap) = supply_cap {
            if cap < total_supply {
                panic!("Supply cap cannot be less than initial supply");
            }
        }
        
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &total_supply);
        env.storage()
            .instance()
            .set(&DataKey::Paused, &false);
        
        if let Some(cap) = supply_cap {
            env.storage()
                .instance()
                .set(&DataKey::SupplyCap, &cap);
        }
        
        env.storage()
            .persistent()
            .set(&DataKey::Balance(admin.clone()), &total_supply);
    }

    /// Transfer tokens from one account to another.
    /// Requires authorization from the sender.
    /// Not allowed when contract is paused.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        
        // Check if contract is paused
        if Self::is_paused(env.clone()) {
            panic!("Contract is paused");
        }
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        
        if from == to {
            panic!("Cannot transfer to self");
        }
        
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("Insufficient balance");
        }
        
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));

        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance.checked_add(amount)
            .expect("Balance overflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &new_to_balance);
        
        // Emit transfer event
        env.events().publish(
            ("transfer",),
            TransferEvent {
                from: from.clone(),
                to: to.clone(),
                amount,
            },
        );
    }

    /// Get the balance of an account.
    pub fn balance(env: Env, account: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(account))
            .unwrap_or(0)
    }

    /// Mint new reward tokens to an account.
    /// Only the admin can call this.
    /// Not allowed when contract is paused.
    /// Respects supply cap if configured.
    pub fn mint_reward(env: Env, recipient: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        
        // Check if contract is paused
        if Self::is_paused(env.clone()) {
            panic!("Cannot mint while paused");
        }
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        
        let current_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        
        // Check supply cap if configured
        if let Some(cap_entry) = env.storage().instance().get::<_, i128>(&DataKey::SupplyCap) {
            let new_supply = current_supply.checked_add(amount)
                .expect("Supply overflow");
            if new_supply > cap_entry {
                panic!("Minting would exceed supply cap");
            }
        }
        
        let recipient_balance = Self::balance(env.clone(), recipient.clone());
        let new_recipient_balance = recipient_balance.checked_add(amount)
            .expect("Balance overflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(recipient.clone()), &new_recipient_balance);

        // Update total supply
        let new_supply = current_supply.checked_add(amount)
            .expect("Supply overflow");
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);
        
        // Emit mint event
        env.events().publish(
            ("mint",),
            MintEvent {
                recipient: recipient.clone(),
                amount,
            },
        );
    }

    /// Burn tokens from an account.
    /// Requires authorization from the token holder.
    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("Insufficient balance");
        }
        
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));

        // Update total supply
        let total_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        let new_supply = total_supply.checked_sub(amount)
            .expect("Supply underflow");
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);
        
        // Emit burn event
        env.events().publish(
            ("burn",),
            BurnEvent {
                from: from.clone(),
                amount,
            },
        );
    }

    /// Approve a spender to transfer tokens on behalf of the token holder.
    pub fn approve(env: Env, from: Address, spender: Address, amount: i128) {
        from.require_auth();
        
        if amount < 0 {
            panic!("Amount cannot be negative");
        }
        
        if from == spender {
            panic!("Cannot approve self");
        }
        
        env.storage()
            .persistent()
            .set(&DataKey::Allowance(from, spender), &amount);
    }

    /// Get the allowance of a spender for a token holder.
    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Allowance(from, spender))
            .unwrap_or(0)
    }

    /// Transfer tokens on behalf of another account.
    /// Requires authorization from the spender.
    /// Decreases the allowance accordingly.
    /// Not allowed when contract is paused.
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        
        // Check if contract is paused
        if Self::is_paused(env.clone()) {
            panic!("Contract is paused");
        }
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        
        if from == to {
            panic!("Cannot transfer to self");
        }
        
        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowance < amount {
            panic!("Insufficient allowance");
        }
        
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("Insufficient balance");
        }

        // Update allowance
        let new_allowance = allowance.checked_sub(amount)
            .expect("Allowance underflow");
        env.storage().persistent().set(
            &DataKey::Allowance(from.clone(), spender),
            &new_allowance,
        );
        
        // Update balances
        let new_from_balance = from_balance.checked_sub(amount)
            .expect("Balance underflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &new_from_balance);

        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance.checked_add(amount)
            .expect("Balance overflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &new_to_balance);
        
        // Emit transfer event
        env.events().publish(
            ("transfer",),
            TransferEvent {
                from: from.clone(),
                to: to.clone(),
                amount,
            },
        );
    }

    /// Admin transfer: Move tokens between accounts without balance limit.
    /// Only the admin can call this.
    /// Useful for corrections and operational needs.
    pub fn admin_transfer(env: Env, from: Address, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        
        if from == to {
            panic!("Cannot transfer to self");
        }
        
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("Insufficient balance");
        }
        
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));

        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance.checked_add(amount)
            .expect("Balance overflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &new_to_balance);
        
        // Emit admin transfer event
        env.events().publish(
            ("admin_transfer",),
            AdminTransferEvent {
                from: from.clone(),
                to: to.clone(),
                amount,
            },
        );
    }

    /// Get the current total supply.
    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    /// Get the supply cap (if configured).
    pub fn supply_cap(env: Env) -> Option<i128> {
        env.storage().instance().get(&DataKey::SupplyCap)
    }

    /// Get the admin address.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    /// Pause the contract (prevents transfers and mints).
    /// Only the admin can call this.
    pub fn pause(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        
        env.storage()
            .instance()
            .set(&DataKey::Paused, &true);
        
        // Emit pause event
        env.events().publish(
            ("pause",),
            PauseEvent {
                paused: true,
            },
        );
    }

    /// Unpause the contract.
    /// Only the admin can call this.
    pub fn unpause(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        
        env.storage()
            .instance()
            .set(&DataKey::Paused, &false);
        
        // Emit unpause event
        env.events().publish(
            ("unpause",),
            PauseEvent {
                paused: false,
            },
        );
    }

    /// Check if the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }
}

mod test;
