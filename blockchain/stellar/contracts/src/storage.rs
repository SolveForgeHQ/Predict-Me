// storage.rs
// Soroban contract storage helpers.

use soroban_sdk::{contracttype, Address, Env, String, Vec};

// ---------------------------------------------------------------------------
// Data keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The admin address
    Admin,
    /// Auto-incrementing counter used to assign market ids
    MarketCount,
    /// Stores a MarketState struct keyed by market id
    Market(u32),
    /// Stores an i128 share balance keyed by (market_id, holder_address, outcome_index)
    /// outcome_index: 0..N-1 (N=2 binary case: 0 = YES, 1 = NO)
    Shares(u32, Address, u32),
}

// ---------------------------------------------------------------------------
// MarketState — the on-chain representation of a market
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MarketState {
    pub question: String,
    pub category: String,
    pub end_timestamp: u64,
    /// Human-readable outcome labels. N >= 2. Binary markets use ["YES", "NO"].
    pub outcomes: Vec<String>,
    /// Pooled stake per outcome index. Always same length as `outcomes`.
    pub pools: Vec<i128>,
    /// 0 = Open, otherwise winning_outcome_index + 1.
    /// N=2 backward compat: 1 = ResolvedYes (winner 0), 2 = ResolvedNo (winner 1).
    pub status: u32,
}

// ---------------------------------------------------------------------------
// Storage accessors
// ---------------------------------------------------------------------------

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_market_count(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::MarketCount).unwrap_or(0)
}

pub fn next_market_id(env: &Env) -> u32 {
    let count = get_market_count(env) + 1;
    env.storage().instance().set(&DataKey::MarketCount, &count);
    count
}

pub fn set_market(env: &Env, id: u32, state: &MarketState) {
    env.storage().persistent().set(&DataKey::Market(id), state);
}

pub fn get_market(env: &Env, id: u32) -> Option<MarketState> {
    env.storage().persistent().get(&DataKey::Market(id))
}

pub fn get_shares(env: &Env, market_id: u32, holder: &Address, side: u32) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Shares(market_id, holder.clone(), side))
        .unwrap_or(0)
}

pub fn set_shares(env: &Env, market_id: u32, holder: &Address, side: u32, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::Shares(market_id, holder.clone(), side), &amount);
}
