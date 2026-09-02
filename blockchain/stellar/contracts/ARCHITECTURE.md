# predict-me Contracts — Architecture

Architecture of the predict-me Soroban smart contract. This document covers the contract's structure, storage model, function design, and how it connects to the frontend.

---

## Overview

The predict-me contract is a binary prediction market engine deployed on Stellar Soroban. An admin wallet creates markets — each is a yes/no question with a resolution deadline. Any Stellar wallet can buy YES or NO shares by sending XLM to the contract. The contract holds all collateral in escrow. When the deadline passes the admin calls `resolve_market` to set the winning outcome. Winners call `claim_winnings` to receive their proportional share of the total pool.

---

## How It Connects to the Frontend

```
┌──────────────────────────────────────────────────────┐
│              Next.js Frontend (App Router)            │
│  /market/[id]  →  BuyPanel  →  lib/contract.ts       │
│  /admin        →  AdminPage →  lib/contract.ts        │
└──────────────────────┬───────────────────────────────┘
                       │  @creit.tech/stellar-wallets-kit
                       │  kit.sign(xdr)
                       ▼
              ┌─────────────────┐
              │ Freighter Wallet │
              └────────┬────────┘
                       │  signed XDR
                       ▼
              ┌─────────────────────────────┐
              │  @stellar/stellar-sdk        │
              │  server.submitTransaction()  │
              └────────┬────────────────────┘
                       │  Soroban RPC
                       ▼
              ┌─────────────────────────────┐
              │    Stellar Testnet           │
              │    predict-me contract       │
              │    (this repo, WASM)         │
              └─────────────────────────────┘
```

The frontend builds `InvokeContractFunction` operations using `lib/contract.ts`, signs them via Freighter, and submits through the Soroban RPC URL in `NEXT_PUBLIC_SOROBAN_RPC_URL`.

---

## Source Layout

```
contracts/
├── src/
│   ├── lib.rs        Contract entrypoint — public interface declaration
│   ├── market.rs     Business logic stubs — create, buy, resolve, claim
│   ├── storage.rs    DataKey enum, MarketState struct, storage accessors
│   └── test.rs       Unit test module (placeholder)
└── tests/
    └── market_test.rs  Integration test plan (all stubs)
```

**Rule:** `lib.rs` only wires function signatures to `market.rs`. Business logic never touches `env.storage()` directly — all reads and writes go through `storage.rs` accessors.

---

## Contract Functions

Declared in `src/lib.rs`, implemented in `src/market.rs`:

### `create_market`

```rust
pub fn create_market(env, question: String, end_timestamp: u64, category: String) -> u32
```

- Verifies `env.invoker() == storage::get_admin()`
- Calls `storage::next_market_id()` to get and increment the counter
- Writes a new `MarketState { yes_pool: 0, no_pool: 0, status: 0 }` via `storage::set_market()`
- Returns the new `market_id`

### `buy_shares`

```rust
pub fn buy_shares(env, market_id: u32, side: u32, amount: i128)
```

- Loads market via `storage::get_market()`, asserts `status == 0` (Open)
- Asserts `env.ledger().timestamp() < end_timestamp`
- Transfers `amount` XLM from caller to contract using the Stellar token client
- Increments `yes_pool` or `no_pool` on `MarketState`
- Increments `storage::get_shares(market_id, caller, side)` by `amount`
- Writes updated market and shares back

### `resolve_market`

```rust
pub fn resolve_market(env, market_id: u32, outcome: u32)
```

- Verifies `env.invoker() == storage::get_admin()`
- Loads market, asserts `status == 0` and `timestamp >= end_timestamp`
- Sets `status = 1` (ResolvedYes) or `status = 2` (ResolvedNo)
- Writes updated market — no funds move at this step

### `claim_winnings`

```rust
pub fn claim_winnings(env, market_id: u32)
```

- Loads market, asserts `status == 1 || status == 2`
- Determines winning side from status
- Loads `caller_shares = storage::get_shares(market_id, caller, winning_side)`
- Calculates `payout = (caller_shares / winning_pool) * total_pool`
- Zeroes out `storage::set_shares(market_id, caller, winning_side, 0)`
- Transfers `payout` XLM from contract to caller

---

## Storage Model

Defined in `src/storage.rs`:

```rust
pub enum DataKey {
    Admin,                          // Address — set at deploy time
    MarketCount,                    // u32 — auto-increments
    Market(u32),                    // MarketState — one per market
    Shares(u32, Address, u32),      // i128 — (market_id, holder, side)
}

pub struct MarketState {
    pub question:       String,
    pub category:       String,
    pub end_timestamp:  u64,
    pub yes_pool:       i128,
    pub no_pool:        i128,
    pub status:         u32,    // 0=Open 1=ResolvedYes 2=ResolvedNo
}
```

`Admin` and `MarketCount` use `instance` storage (cheap, tied to contract lifetime). `Market` and `Shares` entries use `persistent` storage with TTL bumps on access.

---

## Trust Assumptions

- **Manual resolver.** `resolve_market` is gated only by the admin address stored at deploy time. There is no on-chain oracle verifying the real-world outcome. The admin is trusted.
- **Flat share pricing.** Every share costs exactly 1 XLM regardless of pool depth. `yesPercent = yes_pool / total_pool` is a capital distribution, not a probability derived from an AMM.
- **Native XLM only.** Collateral is raw XLM. No USDC, no wrapped assets.
- **No fee.** Payout is `(shares / winning_pool) * total_pool` — 100% returned to winners. No protocol fee has been implemented yet.

---

## Known Limitations

| Limitation | Status |
|---|---|
| All `market.rs` functions are stubs that `panic!` | Unimplemented |
| No `#[contracterror]` enum | Unimplemented |
| `storage.rs` accessors also `panic!` | Unimplemented |
| Admin not set at deploy time | Unimplemented |
| No testnet deployment | Pending implementation |
| No oracle / dispute resolution | Intentionally deferred |
| No AMM / bonding curve | Intentionally deferred |
| No position transferability | Intentionally deferred |

---

## Related Repos

- **Frontend:** [predict-me-frontend](https://github.com/SolveForgeHQ/predict-me-frontend)
