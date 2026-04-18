use soroban_sdk::{contracttype, Address, String};

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PoolStatus {
    Active,
    Exhausted,
    Expired,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MatchingPool {
    pub pool_id: String,
    pub sponsor: Address,
    pub artist: Address,
    pub pool_amount: i128,
    pub remaining_amount: i128,
    pub match_ratio: u32, // 100 = 1:1
    pub start_time: u64,
    pub end_time: u64,
    pub status: PoolStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Pool(String),
    PoolCount,
}
