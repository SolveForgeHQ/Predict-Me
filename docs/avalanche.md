# Avalanche Fuji — Prediction Market Deployment Guide

This is the complete guide to the `PredictionMarket.sol` contract deployed on
Avalanche Fuji, running the test suite, and wiring the address into the app.

---

## Deployed Contract

| Field | Value |
|---|---|
| **Contract Address** | `0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa` |
| **Owner** | `0x376cBCdec2cEC23092363DD04031FBf091B450E9` |
| **Min Stake** | 0.01 AVAX (1e16 wei) |
| **Grace Period** | 7 days (604800 seconds) |
| **Block** | 59915671 |
| **Explorer** | https://testnet.snowtrace.io/address/0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa |

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Contract Reference](#contract-reference)
3. [Payout Formula](#payout-formula)
4. [Fuji Testnet Details](#fuji-testnet-details)
5. [Step 1 — Install Prerequisites](#step-1--install-prerequisites)
6. [Step 2 — Initialize Git Submodules](#step-2--initialize-git-submodules)
7. [Step 3 — Set Up Environment Variables](#step-3--set-up-environment-variables)
8. [Step 4 — Run Tests Locally](#step-4--run-tests-locally)
9. [Step 5 — Deploy to Fuji](#step-5--deploy-to-fuji)
10. [Step 6 — Wire the Contract Address](#step-6--wire-the-contract-address)
11. [Step 7 — Verify on Snowtrace (Optional)](#step-7--verify-on-snowtrace-optional)
12. [Frontend Integration Reference](#frontend-integration-reference)
13. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js Frontend (apps/web) — Netlify                          │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐  │
│  │ ChainContext  │  │ WalletContext   │  │ AvalancheMarketClient│  │
│  │ chain=       │  │ evmAddress      │  │ (viem)              │  │
│  │ "avalanche"  │  │ isWrongNetwork  │  │                     │  │
│  └──────┬───────┘  └───────┬────────┘  └──────────┬──────────┘  │
└─────────┼──────────────────┼─────────────────────┼─────────────┘
          └──────────────────┴─────────────────────┘
                             │ JSON-RPC (viem)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│  Cloudflare Workers Backend — predict-me-backend.workers.dev   │
│  GET /markets?chain=avalanche  (30s cache, D1 persistence)      │
└───────────────────────────────┬────────────────────────────────┘
                                │ viem readContract
                                ▼
┌────────────────────────────────────────────────────────────────┐
│  Avalanche Fuji C-Chain  (Chain ID 43113)                      │
│  PredictionMarket @ 0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa │
│  createMarket  buyShares(payable)  resolveMarket(owner)         │
│  cancelMarket  cancelUnresolved  claimWinnings  refund          │
└────────────────────────────────────────────────────────────────┘
```

---

## Contract Reference

**Source:** `blockchain/avalanche/contracts/src/PredictionMarket.sol`

Inherits `Ownable2Step` and `ReentrancyGuard` from OpenZeppelin. The owner (set at deploy
time via constructor) is the only address that can call `createMarket` and `resolveMarket`.
The deployer and owner may be different keys.

### Market Struct

```solidity
struct Market {
    string question;
    string resolutionCriteria;   // emitted for auditability
    uint64 closeTime;            // Unix timestamp — trading and resolution gate
    MarketStatus status;         // Open | Resolved | Cancelled
    uint256 winningOutcome;      // outcome index, valid only when Resolved
    string[] outcomeLabels;      // N >= 2 outcome labels
    uint256[] pools;             // per-outcome pool amounts in wei
    uint256 totalPool;           // sum of all pools
    uint256 remainingPool;       // used for dust-free last-claimer payout
    uint256 remainingWinningShares;
}
```

### Functions

| Function | Access | Description |
|---|---|---|
| `createMarket(question, outcomes[], closeTime, resolutionCriteria)` | `onlyOwner` | Creates a multi-outcome market |
| `buyShares(marketId, outcomeIndex) payable` | anyone | Buy shares by sending AVAX — must be ≥ `minStake` |
| `resolveMarket(marketId, winningIndex)` | `onlyOwner`, after `closeTime` | Resolves market; auto-cancels if winning pool is zero |
| `cancelMarket(marketId)` | `onlyOwner` | Cancels an open market; stakers can refund |
| `cancelUnresolved(marketId)` | anyone | Cancels if `closeTime + gracePeriod` has passed |
| `claimWinnings(marketId)` | anyone | Dust-free pro-rata payout for winning side |
| `refund(marketId)` | anyone | Returns stake from a cancelled market |
| `getMarket(marketId)` | view | Returns full `Market` struct |
| `getOutcomes(marketId)` | view | Returns outcome labels array |
| `getPools(marketId)` | view | Returns `(pools[], totalPool)` |
| `getPosition(marketId, user)` | view | Returns per-outcome share balances |

### Events

| Event | Fields |
|---|---|
| `MarketCreated` | `marketId`, `question`, `outcomes[]`, `closeTime`, `resolutionCriteria` |
| `SharesBought` | `marketId`, `buyer`, `outcomeIndex`, `amount` |
| `MarketResolved` | `marketId`, `winningOutcome` |
| `MarketCancelled` | `marketId` |
| `WinningsClaimed` | `marketId`, `claimer`, `payout` |
| `Refunded` | `marketId`, `user`, `amount` |

### Constructor Parameters

```solidity
constructor(address initialOwner, uint256 minStake, uint256 resolutionGracePeriod)
```

| Parameter | Deployed Value |
|---|---|
| `initialOwner` | `0x376cBCdec2cEC23092363DD04031FBf091B450E9` |
| `minStake` | `10000000000000000` (0.01 AVAX) |
| `resolutionGracePeriod` | `604800` (7 days) |

---

## Payout Formula

```
payout = (userShares × remainingPool) / remainingWinningShares
```

`remainingPool` and `remainingWinningShares` decrease after each claim so the last
claimer receives the exact remainder — no dust stranded in the contract.

**Example — Two winners:**
- Alice: 20 AVAX YES, Carol: 60 AVAX YES, Bob: 120 AVAX NO → YES wins
- `totalPool = 200 AVAX`, `yesPool = 80 AVAX`
- Alice claims first: `(20 × 200) / 80 = 50 AVAX`
- Carol claims next: `(60 × 150) / 60 = 150 AVAX` (exact remainder, zero dust)

---

## Fuji Testnet Details

| Property | Value |
|---|---|
| Network Name | Avalanche Fuji C-Chain |
| Chain ID | `43113` |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Block Explorer | https://testnet.snowtrace.io |
| Native Currency | AVAX |
| Faucet | https://faucet.avax.network — select **"Fuji"** |

---

## Step 1 — Install Prerequisites

### Install Foundry

**Windows (Git Bash):**
```bash
curl -L https://foundry.paradigm.xyz | bash
~/.foundry/bin/foundryup
forge --version
```

**macOS / Linux:**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Get Fuji Test AVAX

1. Add the Fuji network to MetaMask (RPC above, Chain ID 43113)
2. Go to https://faucet.avax.network, select **Fuji**, request AVAX
3. You need at least **0.5 AVAX** to cover deployment gas

---

## Step 2 — Initialize Git Submodules

The Avalanche contracts share the `lib/` folder with the Stellar contracts.

```bash
git submodule update --init --recursive
```

---

## Step 3 — Set Up Environment Variables

```bash
cp blockchain/avalanche/contracts/.env.example blockchain/avalanche/contracts/.env
```

Fill in `blockchain/avalanche/contracts/.env`:

```env
# Deployer private key (with or without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Optional: owner wallet — defaults to deployer if not set
OWNER_ADDRESS=

# Optional: min stake in wei (default: 1e16 = 0.01 AVAX)
MIN_STAKE=

# Optional: grace period in seconds (default: 604800 = 7 days)
GRACE_PERIOD=

FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
SNOWTRACE_API_KEY=
```

> ⚠️ Never commit `.env`. It is gitignored.

---

## Step 4 — Run Tests Locally

```bash
cd blockchain/avalanche/contracts
forge test -vv
```

Expected: **43 passed; 0 failed** (34 unit + 9 integration tests).

---

## Step 5 — Deploy to Fuji

```bash
cd blockchain/avalanche/contracts
source .env

# Dry run (free)
forge script script/DeployPredictionMarket.s.sol:DeployPredictionMarket \
  --rpc-url $FUJI_RPC_URL \
  -vvvv

# Live deploy
forge script script/DeployPredictionMarket.s.sol:DeployPredictionMarket \
  --rpc-url $FUJI_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvvv
```

The script prints the contract address, owner, min stake, and grace period.

---

## Step 6 — Wire the Contract Address

### `apps/web/.env.local`

```env
NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS=0xYourContractAddress
NEXT_PUBLIC_AVALANCHE_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
NEXT_PUBLIC_BACKEND_URL=https://predict-me-backend.0xchronosfi.workers.dev
```

### `backend/wrangler.toml` under `[vars]`

```toml
AVALANCHE_CONTRACT_ADDRESS = "0xYourContractAddress"
AVALANCHE_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc"
```

Then redeploy the backend:

```bash
cd backend
npx wrangler deploy
```

---

## Step 7 — Verify on Snowtrace (Optional)

```bash
forge verify-contract 0xYourContractAddress PredictionMarket \
  --chain-id 43113 \
  --etherscan-api-key $SNOWTRACE_API_KEY
```

---

## Frontend Integration Reference

The frontend uses `AvalancheMarketClient` from `packages/core/src/avalanche.ts`.

```tsx
import { useChain } from "@/context/ChainContext";
const { chain, chainMetadata, client } = useChain();
// client is AvalancheMarketClient when chain === "avalanche"
```

The chain switcher is currently set to **Avalanche only**. The backend `GET /markets?chain=avalanche`
feeds the market list. The Cloudflare Cron Trigger indexes events from the contract every minute
into `chain_events` for the leaderboard.

---

## Troubleshooting

### `forge: command not found` (Windows)

Use full path: `~/.foundry/bin/forge` or add `~/.foundry/bin` to PATH.

### Submodules missing

```bash
git submodule update --init --recursive
```

### Markets not showing in frontend

1. Check `NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS` in `.env.local`
2. Restart `pnpm dev:web` (env vars baked at startup)
3. Check `http://127.0.0.1:8787/markets?chain=avalanche` directly
4. The backend has a 30-second cache — wait one cycle

### `ResolutionTooEarly` on resolve

The contract enforces `block.timestamp >= closeTime`. You must wait until the market's
close time has passed before resolving.

### `GracePeriodNotExpired` on cancelUnresolved

`cancelUnresolved` is only callable after `closeTime + resolutionGracePeriod` (7 days by
default). If the owner is available, use `cancelMarket` instead.
