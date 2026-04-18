use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TipVaultError {
    VaultNotFound = 1,
    NotVaultOwner = 2,
    InsufficientBalance = 3,
    ReleaseTooEarly = 4,
    Overflow = 5,          // Amount overflow
    Underflow = 6,         // Amount underflow
    TimestampOverflow = 7, // Timestamp calculation overflow
}