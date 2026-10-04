// lib.rs
// Main contract entrypoint for the predict-me prediction market.

#![no_std]

pub mod market;
pub mod storage;

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use storage::MarketState;

#[contract]
pub struct PredictMeContract;

#[contractimpl]
impl PredictMeContract {
    /// Create a new prediction market.
    /// Returns the new market's u32 id.
    pub fn create_market(
        env: Env,
        question: String,
        end_timestamp: u64,
        category: String,
    ) -> u32 {
        market::create_market(env, question, end_timestamp, category)
    }

    /// Buy YES (0) or NO (1) shares in a market.
    pub fn buy_shares(
        env: Env,
        market_id: u32,
        side: u32,
        amount: i128,
        caller: Address,
    ) {
        market::buy_shares(env, market_id, side, amount, caller)
    }

    /// Resolve a market with its final outcome (0 = YES, 1 = NO).
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

    /// Read a user's share balance for a given side.
    pub fn get_shares(env: Env, market_id: u32, holder: Address, side: u32) -> i128 {
        storage::get_shares(&env, market_id, &holder, side)
    }
}
