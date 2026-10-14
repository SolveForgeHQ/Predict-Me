// storage.rs
// Soroban contract storage helpers with support for AMM dynamic pricing.

use soroban_sdk::{contracttype, Address, Env};

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
    /// Stores an i128 share balance keyed by (market_id, holder_address, side)
    /// side: 0 = YES, 1 = NO
    Shares(u32, Address, u32),
    /// Stores the AMM dynamic pricing state for a market
    Amm(u32),
}

// ---------------------------------------------------------------------------
// MarketState - the on-chain representation of a market (v1 compatible)
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
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
// AmmState - dynamic pricing curve reserves and metadata
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AmmState {
    /// Virtual reserve for YES shares in CPMM (R_yes)
    pub yes_reserve: i128,
    /// Virtual reserve for NO shares in CPMM (R_no)
    pub no_reserve: i128,
    /// Total collateral deposited into this market (in base units)
    pub total_collateral: i128,
    /// Total YES shares issued to traders
    pub total_yes_shares: i128,
    /// Total NO shares issued to traders
    pub total_no_shares: i128,
    /// Initial liquidity parameter B (virtual liquidity depth)
    pub initial_b: i128,
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

pub fn get_amm(env: &Env, market_id: u32) -> Option<AmmState> {
    env.storage().persistent().get(&DataKey::Amm(market_id))
}

pub fn set_amm(env: &Env, market_id: u32, state: &AmmState) {
    env.storage().persistent().set(&DataKey::Amm(market_id), state);
}