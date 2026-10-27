# predict-me

A multi-chain prediction market dApp where users bet on real-world outcomes. Markets are
created on-chain, users buy shares, and outcomes are resolved with proportional pari-mutuel
payouts. Currently live on **Avalanche Fuji** (native AVAX) with **Sonic Testnet** (ERC-20)
deployed and available for testing.

---

## Live Deployments

| Network | Component | Address / Identifier |
|---|---|---|
| **Avalanche Fuji** | Prediction Market (native AVAX) | `0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa` |
| **Sonic Testnet** | Prediction Market (ERC-20 / mUSDC) | `0x25D035CB295d94A073107aAB9Ac86a3655a5614E` |
| **Sonic Testnet** | Mock USDC (test token, 6 decimals) | `0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02` |
| **Stellar Testnet** | Soroban Prediction Market (code preserved, not in UI) | `CCGM6LQRQNQGMUXMXHICCH73CDBYOTMV5LEJ7JWWXUBXLRFZJCPAHHXI` |

## Live Infrastructure

| Service | URL |
|---|---|
| **Frontend** | https://predict-me.netlify.app |
| **Backend API** | https://predict-me-backend.0xchronosfi.workers.dev |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | `pnpm` workspaces, TypeScript |
| Frontend | Next.js 16 (App Router), TailwindCSS v4, deployed on Netlify |
| EVM integration | Viem, Wagmi, RainbowKit |
| Smart Contracts | Solidity/Foundry (Avalanche & Sonic), Soroban Rust (Stellar — code preserved) |
| Backend | Cloudflare Workers (Hono + D1 SQLite), deployed as `predict-me-backend` |
| Event Indexer | Cloudflare Cron Trigger (every minute), indexes into D1 `chain_events` |

---

## Quickstart

### Prerequisites

- **Node.js** ≥ 20 and **pnpm** ≥ 10 (`npm i -g pnpm`)
- **MetaMask** or any EVM wallet connected to **Avalanche Fuji** (Chain ID 43113)

### Run Locally

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/SolveForgeHQ/Predict-Me.git
   cd Predict-Me
   pnpm install
   ```

2. **Configure environment variables:**

   Create `apps/web/.env.local`:
   ```env
   NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8787

   NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS=0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa
   NEXT_PUBLIC_AVALANCHE_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
   ```

3. **Start the backend and frontend (two terminals):**
   ```bash
   # Terminal 1
   pnpm dev:backend

   # Terminal 2
   pnpm dev:web
   ```
   Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
predict-me/
├── apps/
│   └── web/                 # Next.js 16 App Router dApp (Netlify)
├── backend/                 # Cloudflare Workers API (Hono + D1 + Cron indexer)
├── blockchain/
│   ├── avalanche/contracts/ # Avalanche Fuji smart contracts (Solidity/Foundry)
│   ├── sonic/contracts/     # Sonic Testnet ERC-20 market contracts (Solidity/Foundry)
│   └── stellar/contracts/   # Soroban smart contract (code preserved, not in UI)
├── packages/
│   ├── core/                # Shared EVM contract clients (Avalanche, Sonic)
│   └── types/               # Shared TypeScript schemas & interfaces
└── docs/
    ├── avalanche.md         # Avalanche deployment guide
    ├── sonic.md             # Sonic deployment guide
    └── architecture.md      # System architecture overview
```

---

## Selectable Chains

The UI currently supports two chains. Stellar code is preserved in the codebase
but is not shown in the chain selector.

| Chain | Status | Currency | Contract |
|---|---|---|---|
| Avalanche Fuji | ✅ Active | AVAX | `0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa` |
| Sonic Testnet | 🔶 Deployed, UI hidden | mUSDC | `0x25D035CB295d94A073107aAB9Ac86a3655a5614E` |
| Stellar Testnet | 🔇 Code preserved | XLM | — |

---

## Backend

The Hono API runs on **Cloudflare Workers** at
`https://predict-me-backend.0xchronosfi.workers.dev`.

Key routes:
- `GET /health` — returns `"OK"`
- `GET /markets?chain=avalanche|sonic|all` — returns cached markets
- `GET /markets/:id?chain=avalanche` — returns a single market
- `POST /auth/login` — signs a Stellar message and issues a 24-hour JWT
- `GET /debug/events` — event counts from D1 chain_events table (dev)

The backend uses **Cloudflare D1** (SQLite) for:
- `market_cache` — market state synced every 30 seconds from on-chain
- `chain_events` — raw on-chain events indexed by the cron trigger
- `indexer_state` — last indexed block per chain
- `price_history` — odds snapshots for the price chart
- `users`, `leaderboard_snapshots`, `quests` — leaderboard data (v2)

---

## Current Status

- **Live on Avalanche Fuji** — markets can be created, traded, resolved, and claimed
- **Sonic Testnet** — fully deployed and indexed, UI hidden pending stablecoin integration
- **Event Indexer** — cron runs every minute, indexes `SharesBought`, `WinningsClaimed`, etc.
- **Price History Chart** — live on market detail pages, fed by D1 snapshots
- **Leaderboard** — D1 tables and indexer in place; UI shows placeholder data (v2)

---

## Roadmap (v2)

- Real USDC on Sonic (replace MockERC20)
- Re-enable Sonic in the chain selector UI
- Leaderboard: real rankings from indexed chain_events
- Oracle-based resolution instead of manual admin
- AMM pricing (bonding curves like Polymarket)
- Portfolio dashboard

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for open issues.
