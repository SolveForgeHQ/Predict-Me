# predict-me — System Architecture

## Overview

predict-me is a multi-chain prediction market dApp. Users connect a wallet, browse markets,
buy YES/NO (or multi-outcome) shares, and claim proportional payouts when outcomes resolve.

The active chain in the UI is **Avalanche Fuji**. The Sonic Testnet contract is deployed and
indexed but the Sonic chain is hidden in the UI pending stablecoin integration. Stellar code
is preserved in the repository but not surfaced in the frontend.

---

## Deployed Infrastructure

| Service | URL / Address |
|---|---|
| Frontend | https://predict-me.netlify.app |
| Backend API | https://predict-me-backend.0xchronosfi.workers.dev |
| Avalanche Contract | `0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa` (Fuji) |
| Sonic Market Contract | `0x25D035CB295d94A073107aAB9Ac86a3655a5614E` (Testnet) |
| Sonic Token (mUSDC) | `0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02` (Testnet) |

---

## Packages

| Package | Description |
|---|---|
| `apps/web` | Next.js 16 App Router frontend, deployed to Netlify |
| `backend` | Hono API on Cloudflare Workers + D1 + Cron event indexer |
| `packages/core` | `AvalancheMarketClient`, `SonicMarketClient`, `StellarMarketClient` |
| `packages/types` | Shared TypeScript types and helpers |
| `blockchain/avalanche` | Solidity/Foundry contracts for Avalanche Fuji |
| `blockchain/sonic` | Solidity/Foundry ERC-20 contracts for Sonic Testnet |
| `blockchain/stellar` | Rust/Soroban contracts (code preserved, not active in UI) |

---

## High-Level Data Flow

```
Browser
  │
  ▼
Next.js App (Netlify)
  │
  ├── ChainContext  ──────────────────────────────────────────────┐
  │   active chain: "avalanche"                                    │
  │   client: AvalancheMarketClient (viem)                        │
  │                                                               │
  ├── GET /markets?chain=avalanche                                │
  │       │                                                        │
  │       ▼                                                        │
  │   Cloudflare Worker (predict-me-backend)                      │
  │       │                                                        │
  │       ├── in-memory cache (30s TTL)                           │
  │       ├── viem readContract → Avalanche Fuji RPC              │
  │       └── D1 SQLite (fallback + persistence)                  │
  │                                                               │
  └── Wallet transactions ────────────────────────────────────────┘
          │
          ▼
      MetaMask / RainbowKit
          │
          ▼
      Avalanche Fuji C-Chain
      PredictionMarket.sol
```

---

## Backend D1 Tables

| Table | Purpose |
|---|---|
| `market_cache` | Market state synced from chain every 30 seconds |
| `chain_events` | Raw on-chain events (SharesBought, WinningsClaimed, etc.) |
| `indexer_state` | Last indexed block per chain (sonic, avalanche) |
| `price_history` | Odds snapshots for the price chart |
| `users` | Wallet address → handle + avatar |
| `leaderboard_snapshots` | Rank/score snapshots (v2) |
| `quests` | Quest definitions (v2) |

---

## Cron Indexer

A Cloudflare Cron Trigger fires every minute and runs `runSonicIndexer` and
`runAvalancheIndexer` in parallel. Each indexer:

1. Reads `indexer_state.last_block` for its chain
2. Fetches logs from the contract RPC in 1000-block (Sonic) or 2000-block (Avalanche) ranges
3. Decodes logs using the inline event ABI
4. Inserts rows into `chain_events` with `INSERT OR IGNORE` (idempotent)
5. Updates `indexer_state` only after each range is fully stored

---

## Smart Contracts

### Avalanche — `PredictionMarket.sol`

- Native AVAX staking (payable `buyShares`)
- `Ownable2Step` — deployer and owner can be different keys
- `createMarket(question, outcomes[], closeTime, resolutionCriteria)`
- `resolveMarket` enforces `block.timestamp >= closeTime`
- Auto-cancels if winning outcome pool is zero
- `cancelMarket` (owner), `cancelUnresolved` (anyone after grace period)
- Dust-free payouts via `remainingPool`/`remainingWinningShares`

### Sonic — `PredictionMarketERC20.sol`

- Same design as Avalanche but stakes in ERC-20 (mUSDC, 6 decimals)
- Rejects fee-on-transfer tokens (balance check after `safeTransferFrom`)
- `refund` for cancelled markets

### Stellar — `predict-me` (Soroban/Rust)

- Code preserved in `blockchain/stellar/contracts/`
- Not connected to the UI; `StellarMarketClient` exists in `packages/core` but
  `ChainId` no longer includes `"stellar"` as a selectable value
