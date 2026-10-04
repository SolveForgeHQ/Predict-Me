# predict-me

A multi-chain prediction market dApp built on **Stellar (Soroban)** and **Avalanche**, where users bet on YES/NO outcomes for real-world questions. Markets are created on-chain, users buy YES or NO shares, and outcomes are resolved with proportional pari-mutuel payouts.

---

## Live Deployments

| Network | Component | Address / Identifier |
|---|---|---|
| **Stellar Testnet** | Soroban Prediction Market | `CCGM6LQRQNQGMUXMXHICCH73CDBYOTMV5LEJ7JWWXUBXLRFZJCPAHHXI` |
| **Avalanche Fuji** | Solidity Prediction Market | `0x49835b6ad67dB224413Ef53A52cFAa19391F20AC` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | `pnpm` workspaces, TypeScript |
| Frontend | Next.js 16 (App Router), TailwindCSS v4 |
| Stellar integration | `@stellar/stellar-sdk` v16, `@creit.tech/stellar-wallets-kit` (Freighter) |
| EVM integration | Viem, Wagmi, RainbowKit |
| Smart Contracts | Soroban SDK v25 (Rust, `wasm32v1-none`) & Solidity (Foundry) |
| Backend | Cloudflare Workers (Hono + D1 SQLite cache) |

---

## Quickstart

### Prerequisites

- **Node.js** ≥ 20 and **pnpm** ≥ 10 (`npm i -g pnpm`)
- **Freighter** wallet browser extension (set to **Testnet**)
- (Optional, for contract development) **Rust** with `wasm32v1-none` target and **Stellar CLI**

### Run Locally

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/SolveForgeHQ/Predict-Me.git
   cd Predict-Me
   pnpm install
   ```

2. **Configure environment variables:**
   In `apps/web/.env.local`:
   ```env
   NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
   NEXT_PUBLIC_STELLAR_NETWORK=testnet
   NEXT_PUBLIC_MARKET_CONTRACT_ID=CCGM6LQRQNQGMUXMXHICCH73CDBYOTMV5LEJ7JWWXUBXLRFZJCPAHHXI
   NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS=GD7WCBHEFPWKRZF7VWOSXXYZJ6KQAWLDU7BIP4FLJQGB6AFENWF6DIAQ

   NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS=0x49835b6ad67dB224413Ef53A52cFAa19391F20AC
   NEXT_PUBLIC_AVALANCHE_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
   NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8787
   ```

3. **Start the frontend:**
   ```bash
   pnpm --filter web dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
predict-me/
├── apps/
│   └── web/                 # Next.js 16 App Router dApp
├── backend/                 # Cloudflare Workers cache API (Hono + D1)
├── blockchain/
│   ├── stellar/contracts/   # Soroban smart contract package (`predict-me`)
│   └── avalanche/contracts/ # Avalanche Fuji smart contracts
├── packages/
│   ├── core/                # Shared Stellar & EVM contract clients
│   └── types/               # Shared TypeScript schemas & interfaces
└── docs/
    ├── stellar.md           # Stellar testnet deployment & test guide
    └── avalanche.md         # Avalanche testnet deployment guide
```

---

## Smart Contracts (`blockchain/stellar/contracts`)

The live contract is located in `blockchain/stellar/contracts/contracts/predict-me`:

```bash
cd blockchain/stellar/contracts

# Build WASM
stellar contract build

# Run unit & integration tests
cargo test
```

### On-Chain Interface

```rust
// Create market — returns u32 market_id
create_market(env, question: String, end_timestamp: u64, category: String) -> u32

// Buy YES (0) or NO (1) shares with XLM (in stroops: 1 XLM = 10_000_000 stroops)
buy_shares(env, market_id: u32, side: u32, amount: i128, caller: Address)

// Resolve market (0 = YES, 1 = NO)
resolve_market(env, market_id: u32, outcome: u32)

// Claim proportional payout on winning shares — returns stroops payout
claim_winnings(env, market_id: u32, caller: Address) -> i128
```

---

## Current Status (v1 Live Prototype)

- **Live on Stellar Testnet:** The Soroban smart contract is live and handles market creation, share purchasing, resolution, and winnings distribution.
- **Pari-Mutuel Pool Model:** v1 operates a pooled pari-mutuel payout model.
- **Open Contributor Issues:** Scoped GitHub issues are open for v2 features including AMM bonding curves, portfolio dashboard, decentralized oracles, and multi-outcome markets. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
