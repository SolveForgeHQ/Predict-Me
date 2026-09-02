# predict-me — Frontend

The Next.js frontend for predict-me, a decentralised prediction market dApp on Stellar Soroban. Users browse YES/NO markets, connect their Freighter wallet, and buy shares. Admins create and resolve markets.

> **Status: v0.1 UI prototype.** All data is mocked in `lib/mockData.ts`. Wallet connection and contract calls are stubbed — no real transactions are submitted yet.

---

## Tech Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | TailwindCSS v4 |
| Stellar SDK | `@stellar/stellar-sdk` v16 |
| Wallet kit | `@creit.tech/stellar-wallets-kit` v2 |
| Data fetching | `@tanstack/react-query` v5 |
| Package manager | pnpm 10 |

---

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10 — `npm i -g pnpm`
- [Freighter](https://freighter.app) browser extension (for wallet features when they're live)

---

## Setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
pnpm build    # production build
pnpm start    # serve the production build
pnpm lint     # ESLint
```

---

## Environment Variables

No `.env` file is needed to run locally — the app falls back to mock data automatically.

When contract integration is added, create `frontend/.env.local`:

```bash
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_MARKET_CONTRACT_ID=C...
```

`lib/contract.ts` reads these at runtime and logs a warning if they're missing.

---

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx               Homepage — market grid + stats bar
│   ├── market/[id]/
│   │   ├── page.tsx           Market detail — odds bar, chart, stats
│   │   └── TradePanel.tsx     Buy YES / Buy NO inputs  [client]
│   ├── admin/page.tsx         Create markets, resolve outcomes  [client]
│   ├── layout.tsx             Root shell — renders <Navbar />
│   └── globals.css            Dark theme CSS variables
│
├── components/
│   ├── Navbar.tsx             Floating glass pill nav  [client]
│   ├── MarketCard.tsx         Grid card — CSS-only hover  [server]
│   ├── MarketGrid.tsx         Grid wrapper — accepts Market[]  [server]
│   ├── BuyPanel.tsx           Trade inputs with stub handlers  [client]
│   ├── PositionCard.tsx       YES/NO share display  [client]
│   └── ConnectWalletButton.tsx  Wallet button stub  [client]
│
└── lib/
    ├── types.ts               Market, Position, WalletState interfaces
    ├── mockData.ts            MOCK_MARKETS[] — replace with contract calls
    ├── markets.ts             formatPool(), timeRemaining() helpers
    ├── contract.ts            Soroban RPC call stubs (fetchMarkets, buyShares…)
    └── wallet.ts              Freighter connection stubs (connectWallet, sign…)
```

---

## Key Files to Know

| File | Purpose |
|---|---|
| `lib/types.ts` | Single source of truth for TypeScript interfaces — mirrors contract state |
| `lib/mockData.ts` | Static data used until contract is deployed. Replace `MOCK_MARKETS` with `fetchMarkets()` from `lib/contract.ts` |
| `lib/contract.ts` | All Soroban call stubs — `fetchMarkets`, `buyShares`, `createMarket`, `resolveMarket`, `claimWinnings` |
| `lib/wallet.ts` | Freighter stubs — `connectWallet`, `signTransaction`, `disconnectWallet` |
| `components/BuyPanel.tsx` | Wire `handleBuyYes` / `handleBuyNo` to `buyShares()` in `lib/contract.ts` |
| `components/ConnectWalletButton.tsx` | Wire `handleClick` to `connectWallet()` in `lib/wallet.ts` |

---

## Pages

| Route | Description |
|---|---|
| `/` | Market grid with stats bar. Server component, reads `MOCK_MARKETS`. |
| `/market/[id]` | Market detail. Large odds bar, fake sparkline chart, sticky trade panel. |
| `/admin` | Create markets (question + end date form) and resolve open markets. All state is local React state only. |

---

## Related Repos

- **Contracts:** [predict-me-contracts](https://github.com/SolveForgeHQ/predict-me-contracts) — Soroban smart contract (Rust)
