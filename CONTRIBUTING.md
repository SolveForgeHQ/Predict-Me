# Contributing to predict-me

Thanks for your interest in contributing. This document covers the workflow for both the frontend and Soroban contracts.

## Project structure

This repository is organized as a pnpm monorepo:

```
predict-me/
├── apps/
│   └── web/                 — Next.js frontend dApp
├── backend/                 — Cloudflare Workers API (Hono + D1)
├── blockchain/
│   ├── stellar/contracts/   — Soroban smart contracts (Rust)
│   └── avalanche/contracts/ — EVM smart contracts (Solidity)
├── packages/
│   ├── core/                — Shared Stellar & Avalanche client SDKs
│   └── types/               — Shared TypeScript types
└── docs/
    ├── stellar.md           — Deployed Soroban testnet documentation
    └── avalanche.md         — Avalanche Fuji contract documentation
```

## Getting started

1. Fork and clone the repo
2. Install dependencies at the monorepo root: `pnpm install`
3. Create a feature branch: `git checkout -b feat/your-feature`

## Frontend (`apps/web`)

```bash
pnpm --filter web dev       # dev server at localhost:3000
pnpm --filter web lint      # ESLint
pnpm --filter web build     # verify production build
```

## Contracts (`blockchain/stellar/contracts`)

```bash
cd blockchain/stellar/contracts
stellar contract build      # compile to WASM
cargo test                  # run test suite
make fmt                    # rustfmt
make lint                   # clippy
```

Deployed Soroban Testnet Contract ID: `CCGM6LQRQNQGMUXMXHICCH73CDBYOTMV5LEJ7JWWXUBXLRFZJCPAHHXI`

## Contributing to Open Issues

We actively welcome contributions! Check the GitHub Issues tab for scoped, prioritized tasks:
- **AMM-based dynamic pricing** (bonding curves / LMSR)
- **Portfolio / positions page**
- **Dispute resolution flow**
- **Multi-outcome market support**
- **Decentralized oracle resolution research**

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
