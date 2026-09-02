// market_test.rs
// Integration tests for the predict-me Soroban contract.
// These tests use soroban_sdk's Env::default() to run the contract
// in a local sandbox without connecting to Stellar Testnet.
//
// Test plan (implement alongside contract functions):
//   test_create_market        — admin creates a market, id is returned
//   test_create_market_unauth — non-admin call must panic / return error
//   test_buy_shares_yes       — user buys YES shares, pool updated
//   test_buy_shares_no        — user buys NO shares, pool updated
//   test_buy_shares_closed    — buying on a resolved market must fail
//   test_resolve_market       — admin resolves, status updated
//   test_resolve_market_unauth — non-admin resolve must fail
//   test_claim_winnings       — winner claims, XLM transferred
//   test_claim_winnings_loser — loser gets nothing

#![cfg(test)]
