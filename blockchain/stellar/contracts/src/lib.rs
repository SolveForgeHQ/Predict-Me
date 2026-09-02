// lib.rs
// Main contract entrypoint for the predict-me prediction market.
// Declares the contract struct and wires the public-facing functions
// to their implementations in market.rs.
//
// Public interface:
//   create_market(env, question, end_timestamp, category) -> u32
//   buy_shares(env, market_id, side, amount)
//   resolve_market(env, market_id, outcome)   -- admin only
//   claim_winnings(env, market_id)
//
// Storage helpers are in storage.rs.
// All business logic lives in market.rs.

#![no_std]

mod market;
mod storage;

use soroban_sdk::{contract, contractimpl, Env, String};

#[contract]
pub struct PredictMeContract;

#[contractimpl]
impl PredictMeContract {
    /// Create a new prediction market. Only callable by the admin address
    /// stored in contract storage at deploy time.
    /// Returns the new market's u32 id.
    pub fn create_market(
        env: Env,
        question: String,
        end_timestamp: u64,
        category: String,
    ) -> u32 {
        market::create_market(env, question, end_timestamp, category)
    }

    /// Buy YES or NO shares in a market. Transfers XLM from caller to contract.
    /// side: 0 = YES, 1 = NO
    pub fn buy_shares(env: Env, market_id: u32, side: u32, amount: i128) {
        market::buy_shares(env, market_id, side, amount)
    }

    /// Resolve a market with its final outcome. Admin only.
    /// outcome: 0 = YES, 1 = NO
    pub fn resolve_market(env: Env, market_id: u32, outcome: u32) {
        market::resolve_market(env, market_id, outcome)
    }

    /// Claim winnings for the calling wallet on a resolved market.
    pub fn claim_winnings(env: Env, market_id: u32) {
        market::claim_winnings(env, market_id)
    }
}

mod test;
