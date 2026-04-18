use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    PoolNotFound = 1,
    InsufficientPoolAmount = 2,
    PoolExpired = 3,
    Unauthorized = 4,
    InvalidParameters = 5,
}
