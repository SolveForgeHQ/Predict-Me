# Contributing to predict-me Contracts

Thanks for contributing to the predict-me Soroban contract. This guide covers the workflow, code standards, and what needs to be built.

---

## Prerequisites

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
cargo install --locked stellar-cli
```

---

## Getting Started

```bash
git clone https://github.com/SolveForgeHQ/predict-me-contracts.git
cd predict-me-contracts
make build
```

Create a feature branch:

```bash
git checkout -b feat/your-feature
```

---

## Daily Commands

Run from `contracts/`:

```bash
make build    # compile to WASM
make test     # build + cargo test
make lint     # cargo clippy -- -D warnings
make fmt      # cargo fmt --all
make clean    # remove build artifacts
```

---

## What Needs to Be Built

The contract interface is defined but all business logic is stubbed. Each stub has a `// TODO:` block explaining exactly what it needs. Work in this order:

1. **`src/storage.rs`** — implement all accessors (`get_admin`, `next_market_id`, `get_market`, `set_market`, `get_shares`, `set_shares`)
2. **Add `#[contracterror]` enum** — replace `panic!()` calls with typed errors
3. **`src/market.rs`** — implement in order: `create_market` → `buy_shares` → `resolve_market` → `claim_winnings`
4. **`src/test.rs`** — unit tests alongside each function
5. **`tests/market_test.rs`** — integration tests; the full test plan is documented there

---

## File Responsibilities

| File | Purpose |
|---|---|
| `src/lib.rs` | Public interface only — do not add logic here |
| `src/market.rs` | All business logic — the only place that calls storage helpers |
| `src/storage.rs` | All `env.storage()` access — market.rs never calls env.storage() directly |
| `src/test.rs` | Unit tests |
| `tests/market_test.rs` | Integration tests using `Env::default()` sandbox |

---

## Code Standards

- `cargo fmt --all` must pass — enforced in CI
- `cargo clippy -- -D warnings` must pass with zero warnings
- No `unwrap()` in contract code — use `?` with typed errors or `panic_with_error!()`
- All public functions must have a doc comment explaining caller restrictions and state changes
- Storage must only be accessed through `storage.rs` helpers — never call `env.storage()` in `market.rs` directly

---

## Testing

Tests run in the Soroban local sandbox — no Testnet connection needed:

```bash
make test
# or
cargo test
```

Every contract function needs both:
- A success path test
- At least one unauthorised / invalid-state test

See `tests/market_test.rs` for the full test plan.

---

## Pull Requests

- One feature or function per PR
- Run `make test` and `make lint` before pushing
- CI (`.github/workflows/test.yml`) must pass
- PR description should state: what function was implemented, what tests cover it, any storage schema changes

---

## Commit Style

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

Examples:
```
feat: implement storage accessors in storage.rs
feat: implement create_market with admin check
test: add integration tests for buy_shares
fix: correct payout calculation in claim_winnings
```

---

## Questions

Open an issue or discussion on [GitHub](https://github.com/SolveForgeHQ/predict-me-contracts).
