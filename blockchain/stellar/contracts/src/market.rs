// market.rs
// Core prediction market logic: create, buy, resolve, claim.
// Multi-outcome: N >= 2 outcomes per market. Binary YES/NO is the N=2 case
// with outcomes ["YES", "NO"] (index 0 = YES, 1 = NO).

use crate::storage::{self, MarketState};
use soroban_sdk::{Address, Env, String, Vec};

/// Maximum outcomes per market (storage / gas bound).
pub const MAX_OUTCOMES: u32 = 32;

/// Creates a new market, stores it, and returns its u32 id.
pub fn create_market(
    env: Env,
    question: String,
    end_timestamp: u64,
    category: String,
    outcomes: Vec<String>,
) -> u32 {
    let n = outcomes.len();
    if n < 2 {
        panic!("At least 2 outcomes required");
    }
    if n > MAX_OUTCOMES {
        panic!("Too many outcomes");
    }
    for i in 0..n {
        let label = outcomes.get(i).unwrap();
        if label.len() == 0 {
            panic!("Outcome label must not be empty");
        }
    }

    let id = storage::next_market_id(&env);

    let mut pools = Vec::new(&env);
    for _ in 0..n {
        pools.push_back(0);
    }

    let state = MarketState {
        question,
        category,
        end_timestamp,
        outcomes,
        pools,
        status: 0, // 0 = Open
    };

    storage::set_market(&env, id, &state);
    id
}

/// Buys shares for the caller on one outcome of a market.
/// outcome_index: 0..N-1 (N=2 case: 0 = YES, 1 = NO)
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

    let n = state.outcomes.len();
    if side >= n {
        panic!("Invalid outcome index");
    }

    let pool = state.pools.get(side).unwrap();
    state.pools.set(side, pool + amount);

    // Update market state
    storage::set_market(&env, market_id, &state);

    // Update user's share balance
    let current_shares = storage::get_shares(&env, market_id, &caller, side);
    storage::set_shares(&env, market_id, &caller, side, current_shares + amount);
}

/// Resolves a market with its final outcome.
/// outcome: winning outcome index 0..N-1 (N=2 case: 0 = YES, 1 = NO)
pub fn resolve_market(env: Env, market_id: u32, outcome: u32) {
    let mut state = storage::get_market(&env, market_id).expect("Market not found");

    if state.status != 0 {
        panic!("Market is already resolved");
    }

    let n = state.outcomes.len();
    if outcome >= n {
        panic!("Invalid outcome index");
    }

    // status = winner_index + 1 (0 stays reserved for Open).
    // Preserves N=2 mapping: YES(0) -> 1, NO(1) -> 2.
    state.status = outcome + 1;

    storage::set_market(&env, market_id, &state);
}

/// Pays out winnings to the caller on a resolved market.
/// Returns the payout amount transferred to the caller.
pub fn claim_winnings(env: Env, market_id: u32, caller: Address) -> i128 {
    caller.require_auth();

    let state = storage::get_market(&env, market_id).expect("Market not found");

    if state.status == 0 {
        panic!("Market is not resolved yet");
    }
    // status = winner_index + 1
    let winning_side = state.status - 1;
    if winning_side >= state.outcomes.len() {
        panic!("Market is not resolved yet");
    }

    let caller_shares = storage::get_shares(&env, market_id, &caller, winning_side);
    if caller_shares <= 0 {
        panic!("No winning shares to claim");
    }

    let winning_pool = state.pools.get(winning_side).unwrap();
    if winning_pool <= 0 {
        panic!("No winning shares to claim");
    }

    let mut total_pool: i128 = 0;
    for i in 0..state.pools.len() {
        total_pool += state.pools.get(i).unwrap();
    }

    // Pro-rata payout: (caller_shares / winning_pool) * total_pool
    let payout = (caller_shares * total_pool) / winning_pool;

    // Zero out user's winning shares so they cannot double claim
    storage::set_shares(&env, market_id, &caller, winning_side, 0);

    payout
}
