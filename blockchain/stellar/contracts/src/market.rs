// market.rs
// Core prediction market logic: create, buy, resolve, claim, with AMM pricing.

use crate::storage::{self, AmmState, MarketState};
use soroban_sdk::{Address, Env, String};

/// Default virtual liquidity parameter B for new AMM markets (10,000 stroops/units).
pub const DEFAULT_AMM_B: i128 = 10_000;

/// Scale factor for basis points (10000 bps = 100%).
pub const BPS_SCALE: i128 = 10_000;

/// Creates a new market with default AMM dynamic pricing and returns its u32 id.
/// Compatible with v1 callers.
pub fn create_market(
    env: Env,
    question: String,
    end_timestamp: u64,
    category: String,
) -> u32 {
    create_market_internal(&env, question, end_timestamp, category, Some(DEFAULT_AMM_B))
}

/// Creates a new market with custom initial AMM virtual liquidity B.
pub fn create_amm_market(
    env: Env,
    question: String,
    end_timestamp: u64,
    category: String,
    initial_b: i128,
) -> u32 {
    if initial_b <= 0 {
        panic!("Initial liquidity B must be positive");
    }
    create_market_internal(&env, question, end_timestamp, category, Some(initial_b))
}

/// Internal helper to initialize market and optional AMM state.
fn create_market_internal(
    env: &Env,
    question: String,
    end_timestamp: u64,
    category: String,
    amm_b: Option<i128>,
) -> u32 {
    let id = storage::next_market_id(env);

    let state = MarketState {
        question,
        category,
        end_timestamp,
        yes_pool: 0,
        no_pool: 0,
        status: 0, // 0 = Open
    };
    storage::set_market(env, id, &state);

    if let Some(b) = amm_b {
        let amm_state = AmmState {
            yes_reserve: b,
            no_reserve: b,
            total_collateral: 0,
            total_yes_shares: 0,
            total_no_shares: 0,
            initial_b: b,
        };
        storage::set_amm(env, id, &amm_state);
    }

    id
}

/// Calculates the spot price of `side` (0 = YES, 1 = NO) in basis points (1..9999).
/// Returns 5000 (50.00%) at initialization.
pub fn get_spot_price(env: Env, market_id: u32, side: u32) -> i128 {
    let amm = storage::get_amm(&env, market_id).expect("AMM state not found for market");
    calculate_spot_price(&amm, side)
}

/// Internal pure function for spot price in basis points.
pub fn calculate_spot_price(amm: &AmmState, side: u32) -> i128 {
    let total_reserve = amm.yes_reserve + amm.no_reserve;
    if total_reserve <= 0 {
        return 5000;
    }

    if side == 0 {
        // Price of YES = R_no / (R_yes + R_no)
        (amm.no_reserve * BPS_SCALE) / total_reserve
    } else if side == 1 {
        // Price of NO = R_yes / (R_yes + R_no)
        (amm.yes_reserve * BPS_SCALE) / total_reserve
    } else {
        panic!("Invalid side (must be 0 for YES or 1 for NO)");
    }
}

/// Quotes how many shares a buyer will receive for `amount` collateral under the AMM curve.
pub fn get_quote(env: Env, market_id: u32, side: u32, amount: i128) -> i128 {
    if amount <= 0 {
        panic!("Amount must be greater than 0");
    }
    let amm = storage::get_amm(&env, market_id).expect("AMM state not found for market");
    calculate_shares_out(&amm, side, amount)
}

/// Pure AMM CPMM calculation:
/// Given constant k = R_yes * R_no:
/// When buying YES with dx:
/// R_no' = R_no + dx
/// R_yes' = ceil(k / R_no') = (k + R_no' - 1) / R_no'
/// shares_out = dx + (R_yes - R_yes')
pub fn calculate_shares_out(amm: &AmmState, side: u32, amount: i128) -> i128 {
    let k = amm.yes_reserve * amm.no_reserve;

    if side == 0 {
        let new_no_reserve = amm.no_reserve + amount;
        // Ceiling division to guarantee k never decreases
        let new_yes_reserve = (k + new_no_reserve - 1) / new_no_reserve;
        let delta_yes = amm.yes_reserve - new_yes_reserve;
        amount + delta_yes
    } else if side == 1 {
        let new_yes_reserve = amm.yes_reserve + amount;
        let new_no_reserve = (k + new_yes_reserve - 1) / new_yes_reserve;
        let delta_no = amm.no_reserve - new_no_reserve;
        amount + delta_no
    } else {
        panic!("Invalid side (must be 0 for YES or 1 for NO)");
    }
}

/// Buys shares for the caller on one side of a market.
/// Automatically executes AMM pricing curve if market is AMM-enabled,
/// or falls back to legacy pooled mode for backward compatibility.
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

    if side != 0 && side != 1 {
        panic!("Invalid side (must be 0 for YES or 1 for NO)");
    }

    // Check if market has AMM state
    if let Some(mut amm) = storage::get_amm(&env, market_id) {
        let shares_out = calculate_shares_out(&amm, side, amount);
        let k = amm.yes_reserve * amm.no_reserve;

        if side == 0 {
            amm.no_reserve += amount;
            amm.yes_reserve = (k + amm.no_reserve - 1) / amm.no_reserve;
            amm.total_yes_shares += shares_out;
            state.yes_pool += amount;
        } else {
            amm.yes_reserve += amount;
            amm.no_reserve = (k + amm.yes_reserve - 1) / amm.yes_reserve;
            amm.total_no_shares += shares_out;
            state.no_pool += amount;
        }

        amm.total_collateral += amount;
        storage::set_amm(&env, market_id, &amm);
        storage::set_market(&env, market_id, &state);

        let current_shares = storage::get_shares(&env, market_id, &caller, side);
        storage::set_shares(&env, market_id, &caller, side, current_shares + shares_out);
    } else {
        // Legacy pooled betting model (backward compatible for existing markets)
        if side == 0 {
            state.yes_pool += amount;
        } else {
            state.no_pool += amount;
        }
        storage::set_market(&env, market_id, &state);

        let current_shares = storage::get_shares(&env, market_id, &caller, side);
        storage::set_shares(&env, market_id, &caller, side, current_shares + amount);
    }
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
/// Supports both AMM-priced markets and legacy pooled markets.
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

    let payout = if let Some(amm) = storage::get_amm(&env, market_id) {
        let winning_shares_total = if winning_side == 0 {
            amm.total_yes_shares
        } else {
            amm.total_no_shares
        };

        if winning_shares_total <= 0 {
            panic!("No winning shares in AMM pool");
        }

        // Pro-rata distribution of all collected collateral
        (caller_shares * amm.total_collateral) / winning_shares_total
    } else {
        // Legacy pooled betting formula
        let winning_pool = if winning_side == 0 {
            state.yes_pool
        } else {
            state.no_pool
        };
        let total_pool = state.yes_pool + state.no_pool;
        (caller_shares * total_pool) / winning_pool
    };

    // Zero out user's winning shares so they cannot double claim
    storage::set_shares(&env, market_id, &caller, winning_side, 0);

    payout
}