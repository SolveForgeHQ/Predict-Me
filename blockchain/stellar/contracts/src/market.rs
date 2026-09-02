// market.rs
// Core market logic: create, buy, resolve, claim.
// All state reads and writes go through storage.rs helpers.
//
// PENDING IMPLEMENTATION — these are stubs that panic with a clear message.
// Replace each panic!() with real logic once the data model is finalised.

use soroban_sdk::{panic_with_error, Env, String};

// TODO: define a proper error enum with #[contracterror]
// using soroban_sdk::contracterror

/// Creates a new market, stores it, and returns its id.
pub fn create_market(
    _env: Env,
    _question: String,
    _end_timestamp: u64,
    _category: String,
) -> u32 {
    // TODO:
    // 1. Verify caller == admin (storage::get_admin)
    // 2. Increment market counter (storage::next_market_id)
    // 3. Build MarketState { question, end_timestamp, category, yes_pool: 0, no_pool: 0, status: Open }
    // 4. Write to storage (storage::set_market)
    // 5. Return new market_id
    panic!("create_market: not yet implemented")
}

/// Buys shares for the calling address on one side of a market.
pub fn buy_shares(_env: Env, _market_id: u32, _side: u32, _amount: i128) {
    // TODO:
    // 1. Load market, assert status == Open and timestamp < end_timestamp
    // 2. Transfer XLM from caller to contract (token client)
    // 3. Increment yes_pool or no_pool on the market
    // 4. Increment shares[caller][market_id][side]
    // 5. Write updated market and shares back to storage
    panic!("buy_shares: not yet implemented")
}

/// Resolves a market. Only callable by the admin.
pub fn resolve_market(_env: Env, _market_id: u32, _outcome: u32) {
    // TODO:
    // 1. Verify caller == admin
    // 2. Load market, assert status == Open and timestamp >= end_timestamp
    // 3. Set status = ResolvedYes | ResolvedNo
    // 4. Write updated market to storage
    panic!("resolve_market: not yet implemented")
}

/// Pays out winnings to the caller on a resolved market.
pub fn claim_winnings(_env: Env, _market_id: u32) {
    // TODO:
    // 1. Load market, assert status == ResolvedYes | ResolvedNo
    // 2. Load caller's shares for the winning side
    // 3. Compute payout = (caller_shares / winning_pool) * total_pool
    // 4. Zero out caller's share balance
    // 5. Transfer payout XLM to caller
    panic!("claim_winnings: not yet implemented")
}
