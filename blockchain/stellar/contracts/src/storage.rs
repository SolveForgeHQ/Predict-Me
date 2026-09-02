// storage.rs
// Soroban contract storage helpers.
// Centralises all DataKey definitions and read/write operations so
// the rest of the contract never touches env.storage() directly.
//
// Planned storage layout:
//
//   DataKey::Admin                           -> Address
//   DataKey::MarketCount                     -> u32
//   DataKey::Market(market_id: u32)          -> MarketState
//   DataKey::Shares(market_id, addr, side)   -> i128
//
// All functions are stubs — implement alongside market.rs.

use soroban_sdk::{contracttype, Address, Env};

// ---------------------------------------------------------------------------
// Data keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    /// The admin address — only this address can create and resolve markets
    Admin,
    /// Auto-incrementing counter used to assign market ids
    MarketCount,
    /// Stores a MarketState struct keyed by market id
    Market(u32),
    /// Stores an i128 share balance keyed by (market_id, holder_address, side)
    /// side: 0 = YES, 1 = NO
    Shares(u32, Address, u32),
}

// ---------------------------------------------------------------------------
// MarketState — the on-chain representation of a market
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct MarketState {
    pub question: soroban_sdk::String,
    pub category: soroban_sdk::String,
    pub end_timestamp: u64,
    pub yes_pool: i128,
    pub no_pool: i128,
    /// 0 = Open, 1 = ResolvedYes, 2 = ResolvedNo
    pub status: u32,
}

// ---------------------------------------------------------------------------
// Storage accessors (stubs)
// ---------------------------------------------------------------------------

/// Returns the admin Address stored at deploy time.
/// TODO: implement with env.storage().instance().get(&DataKey::Admin)
pub fn get_admin(_env: &Env) -> Address {
    panic!("storage::get_admin: not yet implemented")
}

/// Returns the next market id and increments the counter.
/// TODO: read MarketCount, increment, write back, return old value
pub fn next_market_id(_env: &Env) -> u32 {
    panic!("storage::next_market_id: not yet implemented")
}

/// Writes a MarketState to persistent storage.
/// TODO: env.storage().persistent().set(&DataKey::Market(id), &state)
pub fn set_market(_env: &Env, _id: u32, _state: MarketState) {
    panic!("storage::set_market: not yet implemented")
}

/// Reads a MarketState from persistent storage.
/// TODO: env.storage().persistent().get(&DataKey::Market(id))
pub fn get_market(_env: &Env, _id: u32) -> MarketState {
    panic!("storage::get_market: not yet implemented")
}

/// Reads the share balance for a given (market, address, side).
/// Returns 0 if no entry exists.
pub fn get_shares(_env: &Env, _market_id: u32, _holder: &Address, _side: u32) -> i128 {
    panic!("storage::get_shares: not yet implemented")
}

/// Writes the share balance for a given (market, address, side).
pub fn set_shares(_env: &Env, _market_id: u32, _holder: &Address, _side: u32, _amount: i128) {
    panic!("storage::set_shares: not yet implemented")
}
