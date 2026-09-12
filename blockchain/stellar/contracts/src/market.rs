// market.rs
// Core prediction market logic: create, buy, resolve, claim.

use crate::storage::{self, MarketState};
use soroban_sdk::{Address, Env, String};

/// Creates a new market, stores it, and returns its u32 id.
pub fn create_market(
    env: Env,
    question: String,
    end_timestamp: u64,
    category: String,
) -> u32 {
    let id = storage::next_market_id(&env);

    let state = MarketState {
        question,
        category,
        end_timestamp,
        yes_pool: 0,
        no_pool: 0,
        status: 0, // 0 = Open
    };

    storage::set_market(&env, id, &state);
    id
}

/// Buys shares for the caller on one side of a market.
/// side: 0 = YES, 1 = NO
pub fn buy_shares(
    env: Env,
    market_id: u32,
    side: u32,
    amount: i128,
    caller: Address,
) {
    caller.require_auth();

    if amount <= 0 {
        panic!("Amount must be greater than 0");
    }

    let mut state = storage::get_market(&env, market_id).expect("Market not found");

    if state.status != 0 {
        panic!("Market is not open for trading");
    }

    if side == 0 {
        state.yes_pool += amount;
    } else if side == 1 {
        state.no_pool += amount;
    } else {
        panic!("Invalid side (must be 0 for YES or 1 for NO)");
    }

    // Update market state
    storage::set_market(&env, market_id, &state);

    // Update user's share balance
    let current_shares = storage::get_shares(&env, market_id, &caller, side);
    storage::set_shares(&env, market_id, &caller, side, current_shares + amount);
}

/// Resolves a market with its final outcome.
/// outcome: 0 = YES, 1 = NO
pub fn resolve_market(env: Env, market_id: u32, outcome: u32) {
    let mut state = storage::get_market(&env, market_id).expect("Market not found");

    if state.status != 0 {
        panic!("Market is already resolved");
    }

    if outcome == 0 {
        state.status = 1; // ResolvedYes
    } else if outcome == 1 {
        state.status = 2; // ResolvedNo
    } else {
        panic!("Invalid outcome (must be 0 for YES or 1 for NO)");
    }

    storage::set_market(&env, market_id, &state);
}

/// Pays out winnings to the caller on a resolved market.
/// Returns the payout amount transferred to the caller.
pub fn claim_winnings(env: Env, market_id: u32, caller: Address) -> i128 {
    caller.require_auth();

    let state = storage::get_market(&env, market_id).expect("Market not found");

    let winning_side = match state.status {
        1 => 0, // ResolvedYes
        2 => 1, // ResolvedNo
        _ => panic!("Market is not resolved yet"),
    };

    let caller_shares = storage::get_shares(&env, market_id, &caller, winning_side);
    if caller_shares <= 0 {
        panic!("No winning shares to claim");
    }

    let winning_pool = if winning_side == 0 {
        state.yes_pool
    } else {
        state.no_pool
    };

    let total_pool = state.yes_pool + state.no_pool;

    // Pro-rata payout: (caller_shares / winning_pool) * total_pool
    let payout = (caller_shares * total_pool) / winning_pool;

    // Zero out user's winning shares so they cannot double claim
    storage::set_shares(&env, market_id, &caller, winning_side, 0);

    payout
}
