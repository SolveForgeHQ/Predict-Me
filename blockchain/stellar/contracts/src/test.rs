// test.rs
// Multi-outcome tests: N=2 regression + N=4 coverage (issue #4).

#![cfg(test)]

use crate::{PredictMeContract, PredictMeContractClient};
use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};

fn setup<'a>() -> (Env, PredictMeContractClient<'a>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(PredictMeContract, ());
    let client = PredictMeContractClient::new(&env, &id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);
    (env, client, alice, bob, carol)
}

fn outcomes2(env: &Env) -> soroban_sdk::Vec<String> {
    vec![
        &env,
        String::from_str(&env, "YES"),
        String::from_str(&env, "NO"),
    ]
}

fn outcomes4(env: &Env) -> soroban_sdk::Vec<String> {
    vec![
        &env,
        String::from_str(&env, "Alice"),
        String::from_str(&env, "Bob"),
        String::from_str(&env, "Carol"),
        String::from_str(&env, "Dave"),
    ]
}

// --- N=2 regression: single winner takes all ---

#[test]
fn test_binary_single_winner_takes_all() {
    let (env, client, alice, bob, _) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Will X happen?"),
        &9999999999,
        &String::from_str(&env, "general"),
        &outcomes2(&env),
    );
    assert_eq!(id, 1);

    client.buy_shares(&id, &0, &10_0000000, &alice); // 10 XLM YES
    client.buy_shares(&id, &1, &30_0000000, &bob); // 30 XLM NO

    let pools = client.get_pools(&id).unwrap();
    assert_eq!(pools.len(), 2);
    assert_eq!(pools.get(0).unwrap(), 10_0000000);
    assert_eq!(pools.get(1).unwrap(), 30_0000000);

    client.resolve_market(&id, &0); // YES wins
    let m = client.get_market(&id).unwrap();
    assert_eq!(m.status, 1); // winner 0 + 1, preserves old ResolvedYes=1

    let payout = client.claim_winnings(&id, &alice);
    assert_eq!(payout, 40_0000000); // (10 * 40) / 10
    assert_eq!(client.get_shares(&id, &alice, &0), 0); // zeroed, no double claim
}

// --- N=2 regression: multiple winners split proportionally ---

#[test]
fn test_binary_multiple_winners_split() {
    let (env, client, alice, bob, carol) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "general"),
        &outcomes2(&env),
    );
    client.buy_shares(&id, &0, &10_0000000, &alice);
    client.buy_shares(&id, &0, &30_0000000, &bob);
    client.buy_shares(&id, &1, &60_0000000, &carol);
    // total 100, YES pool 40
    client.resolve_market(&id, &0);
    assert_eq!(client.claim_winnings(&id, &alice), 25_0000000); // 10*100/40
    assert_eq!(client.claim_winnings(&id, &bob), 75_0000000); // 30*100/40
}

// --- N=2 regression: NO win preserves old status=2 ---

#[test]
fn test_binary_no_win_status() {
    let (env, client, alice, bob, _) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "general"),
        &outcomes2(&env),
    );
    client.buy_shares(&id, &0, &20_0000000, &alice);
    client.buy_shares(&id, &1, &80_0000000, &bob);
    client.resolve_market(&id, &1);
    let m = client.get_market(&id).unwrap();
    assert_eq!(m.status, 2); // old ResolvedNo=2
    assert_eq!(client.claim_winnings(&id, &bob), 100_0000000);
}

// --- N=4: full lifecycle ---

#[test]
fn test_four_outcomes_lifecycle() {
    let (env, client, alice, bob, carol) = setup();
    let dave = Address::generate(&env);
    let id = client.create_market(
        &String::from_str(&env, "Who wins?"),
        &9999999999,
        &String::from_str(&env, "election"),
        &outcomes4(&env),
    );

    let labels = client.get_outcomes(&id).unwrap();
    assert_eq!(labels.len(), 4);

    client.buy_shares(&id, &0, &10_0000000, &alice);
    client.buy_shares(&id, &1, &20_0000000, &bob);
    client.buy_shares(&id, &2, &30_0000000, &carol);
    client.buy_shares(&id, &3, &40_0000000, &dave);
    // total 100, winner pool (index 2) = 30
    client.resolve_market(&id, &2);
    let m = client.get_market(&id).unwrap();
    assert_eq!(m.status, 3); // winner 2 + 1

    // sole winner on outcome 2 takes whole pool
    assert_eq!(client.claim_winnings(&id, &carol), 100_0000000);
}

// --- N=4: multiple winners on same outcome split ---

#[test]
fn test_four_outcomes_split_winners() {
    let (env, client, alice, bob, carol) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Who wins?"),
        &9999999999,
        &String::from_str(&env, "election"),
        &outcomes4(&env),
    );
    client.buy_shares(&id, &1, &10_0000000, &alice);
    client.buy_shares(&id, &1, &30_0000000, &bob);
    client.buy_shares(&id, &0, &20_0000000, &carol);
    client.buy_shares(&id, &3, &40_0000000, &carol);
    // total 100, winning pool (1) = 40
    client.resolve_market(&id, &1);
    assert_eq!(client.claim_winnings(&id, &alice), 25_0000000);
    assert_eq!(client.claim_winnings(&id, &bob), 75_0000000);
}

// --- Validation / failure modes ---

#[test]
#[should_panic(expected = "At least 2 outcomes required")]
fn test_reject_single_outcome() {
    let (env, client, _, _, _) = setup();
    client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "g"),
        &vec![&env, String::from_str(&env, "Only")],
    );
}

#[test]
#[should_panic(expected = "Outcome label must not be empty")]
fn test_reject_empty_label() {
    let (env, client, _, _, _) = setup();
    client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "g"),
        &vec![
            &env,
            String::from_str(&env, "A"),
            String::from_str(&env, ""),
        ],
    );
}

#[test]
#[should_panic(expected = "Invalid outcome index")]
fn test_reject_buy_invalid_index() {
    let (env, client, alice, _, _) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "g"),
        &outcomes2(&env),
    );
    client.buy_shares(&id, &5, &10_0000000, &alice);
}

#[test]
#[should_panic(expected = "Invalid outcome index")]
fn test_reject_resolve_invalid_index() {
    let (env, client, _, _, _) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "g"),
        &outcomes2(&env),
    );
    client.resolve_market(&id, &7);
}

#[test]
#[should_panic(expected = "Market is not resolved yet")]
fn test_reject_claim_before_resolve() {
    let (env, client, alice, _, _) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "g"),
        &outcomes2(&env),
    );
    client.buy_shares(&id, &0, &10_0000000, &alice);
    client.claim_winnings(&id, &alice);
}

#[test]
#[should_panic(expected = "No winning shares to claim")]
fn test_reject_loser_claim() {
    let (env, client, alice, bob, _) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "g"),
        &outcomes2(&env),
    );
    client.buy_shares(&id, &0, &10_0000000, &alice);
    client.buy_shares(&id, &1, &10_0000000, &bob);
    client.resolve_market(&id, &0);
    client.claim_winnings(&id, &bob);
}

#[test]
#[should_panic(expected = "No winning shares to claim")]
fn test_reject_double_claim() {
    let (env, client, alice, bob, _) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "g"),
        &outcomes2(&env),
    );
    client.buy_shares(&id, &0, &10_0000000, &alice);
    client.buy_shares(&id, &1, &10_0000000, &bob);
    client.resolve_market(&id, &0);
    client.claim_winnings(&id, &alice);
    client.claim_winnings(&id, &alice);
}

#[test]
#[should_panic(expected = "Market is not open for trading")]
fn test_reject_buy_after_resolve() {
    let (env, client, alice, _, _) = setup();
    let id = client.create_market(
        &String::from_str(&env, "Q?"),
        &9999999999,
        &String::from_str(&env, "g"),
        &outcomes2(&env),
    );
    client.resolve_market(&id, &0);
    client.buy_shares(&id, &0, &10_0000000, &alice);
}
