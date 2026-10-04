# predict-me — Architecture

## 1. Overview

**predict-me** is a multi-chain prediction market platform deployed on **Stellar Testnet (Soroban)** and **Avalanche Fuji**. 

Users can browse binary prediction markets, connect their non-custodial wallet (Freighter for Stellar, RainbowKit/MetaMask for Avalanche), and trade YES/NO shares using native currency (XLM or AVAX). Markets operate on an on-chain pooled pari-mutuel model where winners split the total pool proportionally upon market resolution.

---

## 2. High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Browser / User                      │
└───────────────────────────┬─────────────────────────────┘
                            │  HTTP / Client-side
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Next.js Frontend (apps/web)                │
│  /           market grid    live chain / backend cache  │
│  /market/[id]  trade panel  calls PredictionMarketClient│
│  /admin        create/resolve  calls admin contract     │
└──────────┬──────────────────────────────┬───────────────┘
           │  Wallet Integration          │  RPC Simulation / TX
           │  - Stellar: Freighter        │  - Soroban RPC
           │  - Avalanche: Wagmi/Rainbow  │  - Avalanche RPC
           ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│              Packages / Core SDK                        │
│  StellarMarketClient (Soroban SDK / RPC)                │
│  AvalancheMarketClient (Viem / Wagmi)                   │
└──────────┬──────────────────────────────┬───────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────────┐    ┌──────────────────────────┐
│ Stellar Testnet Contract│    │ Avalanche Fuji Contract  │
│ ID: CCGM6LQRQNQGM...    │    │ 0x49835b6ad67dB22...     │
│ (predict-me package)    │    │ (PredictionMarket.sol)   │
└─────────────────────────┘    └──────────────────────────┘
```

---

## 3. Monorepo Organization

The project is structured with `pnpm workspaces`:

```
predict-me/
├── apps/
│   └── web/                 # Next.js 16 App Router UI dApp
├── backend/                 # Cloudflare Workers cache & auth API
├── blockchain/
│   ├── stellar/contracts/   # Soroban contract (contracts/predict-me)
│   └── avalanche/contracts/ # Avalanche Fuji contract (Foundry)
├── packages/
│   ├── core/                # StellarMarketClient & AvalancheMarketClient SDKs
│   └── types/               # Shared TypeScript interfaces
└── docs/
    ├── stellar.md           # Stellar testnet deployment & test guide
    └── avalanche.md         # Avalanche Fuji documentation
```

---

## 4. Smart Contract Architecture (Stellar Soroban)

The active Soroban contract is deployed on Stellar Testnet:
- **Contract ID:** `CCGM6LQRQNQGMUXMXHICCH73CDBYOTMV5LEJ7JWWXUBXLRFZJCPAHHXI`
- **Source location:** `blockchain/stellar/contracts/contracts/predict-me`

### Contract Interface

```rust
create_market(env, question: String, end_timestamp: u64, category: String) -> u32
buy_shares(env, market_id: u32, side: u32, amount: i128, caller: Address)
resolve_market(env, market_id: u32, outcome: u32)
claim_winnings(env, market_id: u32, caller: Address) -> i128
get_market(env, market_id: u32) -> Option<MarketState>
get_shares(env, market_id: u32, holder: Address, side: u32) -> i128
```

### Storage Layout

- `DataKey::MarketCount` → `u32` (Auto-incrementing market ID counter)
- `DataKey::Market(u32)` → `MarketState` (question, category, end_timestamp, yes_pool, no_pool, status)
- `DataKey::Shares(u32, Address, u32)` → `i128` (User's share balance in stroops: 1 XLM = 10,000,000 stroops)

### Settlement Math

Pro-rata pari-mutuel calculation at resolution:
$$\text{payout} = \frac{\text{callerWinningShares} \times \text{totalPool}}{\text{winningPool}}$$

Winning shares are zeroed upon claim to guarantee idempotency and prevent double-claims.

---

## 5. Security & Access Control

1. **Stellar Authentication:**
   - Contract operations requiring caller authorization (`buy_shares`, `claim_winnings`) invoke `caller.require_auth()`.
2. **Double-Claim Prevention:**
   - Claiming winnings sets `shares[marketId][caller][side] = 0` prior to returning the payout.
3. **Admin Controls:**
   - Market creation and resolution are guarded by the admin wallet address configured in the UI and verified on-chain.
