# predict-me

A decentralised prediction market dApp built on Stellar Soroban where users bet on YES/NO outcomes for real-world questions. Markets are created by an admin, users buy YES or NO shares, and outcomes are resolved on-chain.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript |
| Styling | TailwindCSS v4 |
| Stellar integration | `@stellar/stellar-sdk` v16, `@creit.tech/stellar-wallets-kit` |
| Wallet | Freighter browser extension |
| Smart contracts | Rust + Soroban SDK v25 |
| Contract tooling | Stellar CLI (`stellar contract build`) |

---

## Prerequisites

- **Node.js** ≥ 20 and **pnpm** ≥ 10 (`npm i -g pnpm`)
- **Freighter** wallet extension installed in your browser
- For contracts: **Rust** with the `wasm32v1-none` target and **Stellar CLI**

```bash
# Rust + wasm target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none

# Stellar CLI
cargo install --locked stellar-cli
```

---

## Setup

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Contracts

```bash
cd contracts/contracts/hello-world

# Build
make build
# or: stellar contract build

# Test
make test
# or: cargo test

# Format
make fmt
```

---

## Project Structure

```
prediction-market/
├── frontend/                   # Next.js app
│   ├── app/
│   │   ├── page.tsx            # Homepage — market grid
│   │   ├── market/[id]/        # Market detail + trade panel
│   │   │   ├── page.tsx
│   │   │   └── TradePanel.tsx  # Buy YES / Buy NO UI (client component)
│   │   ├── admin/page.tsx      # Create markets, resolve outcomes
│   │   ├── layout.tsx          # Root layout with Navbar
│   │   └── globals.css
│   ├── components/
│   │   ├── Navbar.tsx          # Floating glass navbar
│   │   └── MarketCard.tsx      # Card shown in the market grid
│   └── lib/
│       └── markets.ts          # Mock market data + helper functions
│
└── contracts/                  # Soroban smart contracts (Rust)
    └── contracts/
        └── hello-world/        # Placeholder contract (replace with market logic)
            ├── src/lib.rs
            └── Makefile
```

---

## Environment Variables

No `.env` file is required to run the frontend locally — all data is mocked.

When connecting to Stellar mainnet or testnet, you will need:

```bash
# frontend/.env.local
NEXT_PUBLIC_STELLAR_NETWORK=testnet          # testnet | mainnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_MARKET_CONTRACT_ID=C...          # deployed contract address
```

These are not wired up yet. Add them before integrating real contract calls.

---

## Available Scripts

### Frontend (`cd frontend`)

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server at localhost:3000 |
| `pnpm build` | Production build |
| `pnpm start` | Serve production build |
| `pnpm lint` | Run ESLint |

### Contracts (`cd contracts/contracts/hello-world`)

| Command | Description |
|---|---|
| `make build` | Compile contract to `.wasm` |
| `make test` | Build then run `cargo test` |
| `make fmt` | Format Rust source |
| `make clean` | Remove build artifacts |

---

## Current Status

**v0.1 — UI prototype with mock data.**

- All market data is hardcoded in `frontend/lib/markets.ts`. No database or backend exists yet.
- Wallet connection button is present but no real wallet logic is wired up.
- Trade inputs (Buy YES / Buy NO) are UI-only — no transactions are submitted.
- The admin "Resolve" buttons update local React state only; nothing is written on-chain.
- The Soroban contract is a scaffold placeholder (`hello-world`) and does not implement any market logic yet.

This codebase is **not production-ready**. It is a frontend shell intended to validate UX and design before contract development begins.
