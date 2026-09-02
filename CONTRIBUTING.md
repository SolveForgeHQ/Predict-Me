# Contributing to predict-me

Thanks for your interest in contributing. This document covers the workflow for both the frontend and Soroban contracts.

## Project structure

```
prediction-market/
├── frontend/   — Next.js app (TypeScript)
└── contracts/  — Soroban smart contract (Rust)
```

## Getting started

1. Fork and clone the repo
2. Follow the setup steps in [README.md](README.md)
3. Create a feature branch: `git checkout -b feat/your-feature`

## Frontend

```bash
cd frontend
pnpm install
pnpm dev        # dev server at localhost:3000
pnpm lint       # ESLint
pnpm build      # verify production build before opening a PR
```

Key files to know:

| File | Purpose |
|---|---|
| `lib/types.ts` | Shared TypeScript interfaces |
| `lib/mockData.ts` | Static placeholder data |
| `lib/contract.ts` | Soroban RPC call stubs |
| `lib/wallet.ts` | Freighter wallet connection stubs |

## Contracts

```bash
cd contracts
make build      # compile to WASM
make test       # build + cargo test
make fmt        # rustfmt
make lint       # clippy
```

All contract logic lives in `src/`. Tests go in `tests/market_test.rs`.

## Commit style

Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.

## Pull requests

- Keep PRs focused — one feature or fix per PR
- Describe what changed and why
- Run `pnpm build` (frontend) and `make test` (contracts) before pushing
- The CI workflow (`.github/workflows/test.yml`) must pass

## Code style

- TypeScript: ESLint config in `frontend/eslint.config.mjs`
- Rust: `cargo fmt` and `cargo clippy` must pass with no warnings

## Questions

Open an issue or start a discussion on GitHub.
