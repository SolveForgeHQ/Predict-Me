// test.rs
// Comprehensive test suite for AMM dynamic pricing curve, predictability,
// anti-drain solvency, and legacy pooled market backward compatibility.

#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    Address, Env, String,
};

fn create_test_env() -> (Env, PredictMeContractClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PredictMeContract, ());
    let client = PredictMeContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);

    (env, client, alice, bob, charlie)
}

#[test]
fn test_initial_spot_price_is_50_50() {
    let (env, client, _, _, _) = create_test_env();

    let question = String::from_str(&env, "Will Stellar Soroban surpass 1M tx/day?");
    let category = String::from_str(&env, "Crypto");
    let market_id = client.create_market(&question, &1_800_000_000, &category);

    // Initial spot price for both sides must be exactly 5000 bps (50.00%)
    let yes_price = client.get_spot_price(&market_id, &0);
    let no_price = client.get_spot_price(&market_id, &1);

    assert_eq!(yes_price, 5000);
    assert_eq!(no_price, 5000);
    assert_eq!(yes_price + no_price, 10000);
}

#[test]
fn test_price_moves_predictably_with_trade_size() {
    let (env, client, alice, bob, _) = create_test_env();

    let question = String::from_str(&env, "Will BTC reach 150k in 2026?");
    let category = String::from_str(&env, "Crypto");
    // Create with B = 10,000 stroops
    let market_id = client.create_amm_market(&question, &1_800_000_000, &category, &10_000);

    // Initial price is 50% (5000 bps)
    assert_eq!(client.get_spot_price(&market_id, &0), 5000);

    // Alice buys YES with 2,000 collateral
    let quote_alice = client.get_quote(&market_id, &0, &2000);
    client.buy_shares(&market_id, &0, &2000, &alice);

    let alice_shares = client.get_shares(&market_id, &alice, &0);
    assert_eq!(alice_shares, quote_alice);
    assert!(alice_shares > 2000); // At 50-54% price, user gets > 1 share per collateral unit

    // Price of YES must have increased
    let yes_price_after_alice = client.get_spot_price(&market_id, &0);
    assert!(yes_price_after_alice > 5000);

    // Bob now makes a larger trade on YES (5,000 collateral)
    let quote_bob = client.get_quote(&market_id, &0, &5000);
    client.buy_shares(&market_id, &0, &5000, &bob);

    let bob_shares = client.get_shares(&market_id, &bob, &0);
    assert_eq!(bob_shares, quote_bob);

    // Compare effective prices: Bob paid more per share than Alice
    // Effective price = amount / shares
    // Cross-multiply: (2000 * bob_shares) < (5000 * alice_shares)
    assert!(2000 * bob_shares < 5000 * alice_shares);

    // Spot price of YES increases even further
    let yes_price_after_bob = client.get_spot_price(&market_id, &0);
    assert!(yes_price_after_bob > yes_price_after_alice);

    // Price of NO decreases correspondingly
    let no_price_after_bob = client.get_spot_price(&market_id, &1);
    assert_eq!(yes_price_after_bob + no_price_after_bob, 10000);
}

#[test]
fn test_price_moves_back_toward_50_on_opposing_trade() {
    let (env, client, alice, bob, _) = create_test_env();

    let question = String::from_str(&env, "Will ETH flip BTC market cap?");
    let category = String::from_str(&env, "Crypto");
    let market_id = client.create_amm_market(&question, &1_800_000_000, &category, &10_000);

    // Initial 50%
    assert_eq!(client.get_spot_price(&market_id, &0), 5000);

    // Alice pushes YES up with 3,000 collateral
    client.buy_shares(&market_id, &0, &3000, &alice);
    let price_high = client.get_spot_price(&market_id, &0);
    assert!(price_high > 5000);

    // Bob buys NO with the exact same 3,000 collateral
    client.buy_shares(&market_id, &1, &3000, &bob);
    let price_reverted = client.get_spot_price(&market_id, &0);

    // Price must return symmetrically to 5000 bps (50.00%)
    assert_eq!(price_reverted, 5000);
}

#[test]
fn test_pool_cannot_be_drained_repeated_trades() {
    let (env, client, alice, bob, charlie) = create_test_env();

    let question = String::from_str(&env, "Will inflation fall below 2%?");
    let category = String::from_str(&env, "Macro");
    let market_id = client.create_amm_market(&question, &1_800_000_000, &category, &5_000);

    // Multiple alternating trades of varying sizes
    client.buy_shares(&market_id, &0, &500, &alice);
    client.buy_shares(&market_id, &1, &800, &bob);
    client.buy_shares(&market_id, &0, &1200, &alice);
    client.buy_shares(&market_id, &1, &300, &charlie);
    client.buy_shares(&market_id, &0, &700, &alice);
    client.buy_shares(&market_id, &1, &1500, &bob);
    client.buy_shares(&market_id, &0, &400, &charlie);

    let total_deposited: i128 = 500 + 800 + 1200 + 300 + 700 + 1500 + 400; // 5400

    let amm = client.get_amm(&market_id).unwrap();
    assert_eq!(amm.total_collateral, total_deposited);

    // Market resolves to YES (outcome = 0)
    client.resolve_market(&market_id, &0);

    // Alice and Charlie are YES holders, Bob is NO holder
    let alice_payout = client.claim_winnings(&market_id, &alice);
    let charlie_payout = client.claim_winnings(&market_id, &charlie);

    // Total payout can NEVER exceed total collateral deposited
    let total_payout = alice_payout + charlie_payout;
    assert!(total_payout <= total_deposited);
    // Solvency strictly maintained
    assert!(total_deposited - total_payout >= 0);
}

#[test]
fn test_pool_cannot_be_drained_single_large_whale_trade() {
    let (env, client, alice, _, _) = create_test_env();

    let question = String::from_str(&env, "Will fusion power achieve net gain?");
    let category = String::from_str(&env, "Science");
    let market_id = client.create_amm_market(&question, &1_800_000_000, &category, &2_000);

    // Whale trade: 50,000 collateral on YES (25x pool depth B)
    client.buy_shares(&market_id, &0, &50_000, &alice);

    // Resolve market to YES
    client.resolve_market(&market_id, &0);

    // Alice claims winnings
    let payout = client.claim_winnings(&market_id, &alice);

    // Payout must exactly equal the deposited collateral (cannot extract uncollateralized funds)
    assert_eq!(payout, 50_000);
}

#[test]
fn test_legacy_pooled_market_compatibility() {
    let (env, client, alice, bob, _) = create_test_env();

    // Directly set a legacy MarketState with NO AmmState attached
    let question = String::from_str(&env, "Legacy pooled question?");
    let category = String::from_str(&env, "Legacy");
    let id = storage::next_market_id(&env);

    let legacy_state = storage::MarketState {
        question,
        category,
        end_timestamp: 1_800_000_000,
        yes_pool: 0,
        no_pool: 0,
        status: 0,
    };
    storage::set_market(&env, id, &legacy_state);

    // Confirm get_amm returns None for legacy market
    assert_eq!(client.get_amm(&id), None);

    // Buy in legacy market (1:1 collateral to shares)
    client.buy_shares(&id, &0, &300, &alice);
    client.buy_shares(&id, &1, &100, &bob);

    let alice_shares = client.get_shares(&id, &alice, &0);
    assert_eq!(alice_shares, 300); // 1:1 in legacy pooled mode

    // Resolve YES
    client.resolve_market(&id, &0);

    // Alice claims: (300 / 300) * 400 = 400 payout
    let payout = client.claim_winnings(&id, &alice);
    assert_eq!(payout, 400);
}

#[test]
#[should_panic(expected = "No winning shares to claim")]
fn test_double_claim_prevented() {
    let (env, client, alice, _, _) = create_test_env();

    let question = String::from_str(&env, "Double claim test?");
    let category = String::from_str(&env, "Test");
    let market_id = client.create_market(&question, &1_800_000_000, &category);

    client.buy_shares(&market_id, &0, &500, &alice);
    client.resolve_market(&market_id, &0);

    client.claim_winnings(&market_id, &alice);
    // Second claim must panic
    client.claim_winnings(&market_id, &alice);
}

#[test]
#[should_panic(expected = "Market is not open for trading")]
fn test_cannot_buy_after_resolution() {
    let (env, client, alice, _, _) = create_test_env();

    let question = String::from_str(&env, "Closed trading test?");
    let category = String::from_str(&env, "Test");
    let market_id = client.create_market(&question, &1_800_000_000, &category);

    client.resolve_market(&market_id, &0);
    client.buy_shares(&market_id, &0, &100, &alice);
}