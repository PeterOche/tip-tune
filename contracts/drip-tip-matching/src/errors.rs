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
    InvalidMatchRatio = 6,
    InvalidMatchCap = 7,
    PoolNotActive = 8,
    EmptyPool = 9,
    MatchWouldExceedCap = 10,
    PoolAlreadyRefunded = 11,
    InvalidCloseStatus = 12,
}
