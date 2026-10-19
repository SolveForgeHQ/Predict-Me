// lib.rs
// Main contract entrypoint for the predict-me prediction market.

#![no_std]

pub mod market;
pub mod storage;

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};
use storage::MarketState;

#[contract]
pub struct PredictMeContract;

#[contractimpl]
impl PredictMeContract {
    /// Create a new prediction market with N >= 2 outcomes.
    /// Binary markets use outcomes ["YES", "NO"] (the N=2 case).
    /// Returns the new market's u32 id.
    pub fn create_market(
        env: Env,
        question: String,
        end_timestamp: u64,
        category: String,
        outcomes: Vec<String>,
    ) -> u32 {
        market::create_market(env, question, end_timestamp, category, outcomes)
    }

    /// Buy shares on one outcome (outcome_index 0..N-1).
    /// N=2 case: 0 = YES, 1 = NO.
    pub fn buy_shares(
        env: Env,
        market_id: u32,
        side: u32,
        amount: i128,
        caller: Address,
    ) {
        market::buy_shares(env, market_id, side, amount, caller)
    }

    /// Resolve a market with its winning outcome index (0..N-1).
    /// N=2 case: 0 = YES, 1 = NO.
    pub fn resolve_market(env: Env, market_id: u32, outcome: u32) {
        market::resolve_market(env, market_id, outcome)
    }

    /// Claim winnings for the calling wallet on a resolved market.
    /// Returns the payout amount.
    pub fn claim_winnings(env: Env, market_id: u32, caller: Address) -> i128 {
        market::claim_winnings(env, market_id, caller)
    }

    /// Read market state.
    pub fn get_market(env: Env, market_id: u32) -> Option<MarketState> {
        storage::get_market(&env, market_id)
    }

    /// Read a user's share balance for a given outcome index.
    pub fn get_shares(env: Env, market_id: u32, holder: Address, side: u32) -> i128 {
        storage::get_shares(&env, market_id, &holder, side)
    }

    /// Read outcome labels for a market.
    pub fn get_outcomes(env: Env, market_id: u32) -> Option<Vec<String>> {
        storage::get_market(&env, market_id).map(|m| m.outcomes)
    }

    /// Read per-outcome pools for a market.
    pub fn get_pools(env: Env, market_id: u32) -> Option<Vec<i128>> {
        storage::get_market(&env, market_id).map(|m| m.pools)
    }
}

#[cfg(test)]
mod test;
