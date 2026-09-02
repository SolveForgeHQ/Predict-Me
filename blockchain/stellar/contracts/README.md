# predict-me — Contracts

The Soroban smart contract for predict-me, a decentralised prediction market dApp on Stellar. Written in Rust using the Soroban SDK.

> **Status: v0.1 scaffold.** The contract interface (`create_market`, `buy_shares`, `resolve_market`, `claim_winnings`) is defined in `src/lib.rs`. Business logic stubs live in `src/market.rs`. Storage helpers are in `src/storage.rs`. None of the functions are implemented yet — each body contains a `TODO` comment and panics.

---

## Tech Stack

| | |
|---|---|
| Language | Rust (no_std) |
| SDK | soroban-sdk v25 |
| Build target | wasm32v1-none |
| Toolchain | Stellar CLI, cargo |

---

## Prerequisites

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# WASM target
rustup target add wasm32v1-none

# Stellar CLI
cargo install --locked stellar-cli
```

---

## Setup & Commands

All commands run from the `contracts/` directory.

```bash
make build    # compile to .wasm  (stellar contract build)
make test     # build + cargo test
make lint     # cargo clippy -- -D warnings
make fmt      # cargo fmt --all
make clean    # cargo clean
```

Deploy to Stellar Testnet (requires a funded identity configured in Stellar CLI):

```bash
make deploy IDENTITY=my-key
```

---

## Project Structure

```
contracts/
├── Cargo.toml              Workspace config, soroban-sdk = "25"
├── Makefile                build / test / lint / deploy shortcuts
├── src/
│   ├── lib.rs              Contract entrypoint — declares public interface
│   ├── market.rs           Business logic stubs (create, buy, resolve, claim)
│   ├── storage.rs          DataKey enum, MarketState struct, storage accessors
│   └── test.rs             Unit test module (placeholder)
└── tests/
    └── market_test.rs      Integration test plan (all stubs — implement with logic)
```

---

## Contract Interface

Defined in `src/lib.rs`, implemented in `src/market.rs`:

```rust
// Create a new market — admin only. Returns market_id.
create_market(env, question: String, end_timestamp: u64, category: String) -> u32

// Buy YES (side=0) or NO (side=1) shares. Transfers XLM from caller.
buy_shares(env, market_id: u32, side: u32, amount: i128)

// Resolve a market with outcome 0=YES or 1=NO — admin only.
resolve_market(env, market_id: u32, outcome: u32)

// Claim proportional winnings for the calling wallet.
claim_winnings(env, market_id: u32)
```

---

## Storage Layout

Defined in `src/storage.rs`:

```
DataKey::Admin                           → Address
DataKey::MarketCount                     → u32
DataKey::Market(market_id: u32)          → MarketState
DataKey::Shares(market_id, addr, side)   → i128
```

`MarketState` fields: `question`, `category`, `end_timestamp`, `yes_pool`, `no_pool`, `status` (0=Open, 1=ResolvedYes, 2=ResolvedNo).

---

## Test Plan

Defined in `tests/market_test.rs`. Tests to implement once contract logic is written:

- `test_create_market` — admin creates a market, correct id returned
- `test_create_market_unauth` — non-admin call must fail
- `test_buy_shares_yes` / `test_buy_shares_no` — pool updated correctly
- `test_buy_shares_closed` — buying on a resolved market must fail
- `test_resolve_market` — admin resolves, status set correctly
- `test_resolve_market_unauth` — non-admin resolve must fail
- `test_claim_winnings` — winner receives correct XLM payout
- `test_claim_winnings_loser` — losing side gets nothing

---

## Current Limitations

- All `src/market.rs` functions `panic!("not yet implemented")` — no logic exists yet
- No error enum — needs `#[contracterror]` before functions can return typed errors
- No testnet deployment — the contract has not been deployed anywhere
- Admin address is not set at deploy time yet — `storage::get_admin` is also a stub

---

## Related Repos

- **Frontend:** [predict-me-frontend](https://github.com/SolveForgeHQ/predict-me-frontend) — Next.js UI
