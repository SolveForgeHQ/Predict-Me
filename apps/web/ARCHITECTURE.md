# predict-me Frontend — Architecture

This document covers the Next.js 16 App Router frontend deployed at
https://predict-me.netlify.app.

---

## Overview

The app is a Next.js 16 App Router project. Pages are Server Components by default;
interactive pieces (wallet, trading, admin) are `"use client"` components. Market data
comes from the Cloudflare Workers backend (`predict-me-backend.0xchronosfi.workers.dev`),
which caches contract state from Avalanche Fuji.

The active chain in the UI is **Avalanche Fuji**. Sonic Testnet code is wired up but the
chain is hidden from the selector. Stellar code is preserved in the repository but removed
from `ChainId` — it never renders.

---

## Source Layout

```
apps/web/
├── app/
│   ├── page.tsx                Homepage — server component, loads markets from backend
│   ├── market/
│   │   ├── page.tsx            Market browse — client component, chain-aware filter
│   │   └── [id]/
│   │       ├── page.tsx        Market detail — server component, live backend fetch
│   │       └── TradePanel.tsx  Buy shares — client component
│   ├── admin/page.tsx          Admin panel — create/resolve markets, owner-gated
│   ├── leaderboard/page.tsx    Leaderboard (placeholder data, v2)
│   ├── quests/page.tsx         Quests (placeholder data, v2)
│   ├── layout.tsx              Root layout — Geist font, providers
│   └── globals.css             CSS variables + dark theme
│
├── components/
│   ├── TopBar.tsx              Sticky glass pill header + wallet button
│   ├── BottomNav.tsx           Floating bottom nav
│   ├── MarketCard.tsx          Market grid card
│   ├── PositionCard.tsx        On-chain position + claim winnings
│   ├── PriceChart.tsx          Live odds chart (D1 snapshots)
│   ├── StatusBanner.tsx        Pending / error / success / wrong-network banners
│   └── ChainSwitcher.tsx       Chain dropdown (currently shows Avalanche only)
│
├── context/
│   ├── ChainContext.tsx        Active chain + PredictionMarketClient instance
│   ├── WalletContext.tsx       Wallet state (EVM via Wagmi/RainbowKit)
│   └── ToastContext.tsx        Toast notification system
│
├── providers/
│   └── RainbowWeb3Provider.tsx Wagmi + RainbowKit (Avalanche Fuji + Mainnet)
│
└── lib/
    ├── markets.ts              loadMarketsWithSource() — backend → fallback
    ├── types.ts                Frontend Market, Position types
    ├── api.ts                  apiFetch() — credentials:include for HttpOnly cookie
    ├── auth.ts                 Post-connect JWT flow (Stellar only)
    ├── errors.ts               Chain-aware transaction error formatter
    ├── wallet.ts               StellarWalletsKit wrapper (preserved, not active in UI)
    └── contract.ts             Soroban RPC helpers (preserved, not active in UI)
```

---

## Chain Selection

`ChainContext` defines the active chain and instantiates the correct client:

```ts
export type ChainId = "avalanche" | "stellar"; // "sonic" removed from UI
export const SELECTABLE_CHAINS = ["avalanche"];
export const DEFAULT_CHAIN = "avalanche";
```

The `ChainSwitcher` component reads `SELECTABLE_CHAINS` — it shows only Avalanche.
To re-enable Sonic, add `"sonic"` back to `SELECTABLE_CHAINS` and uncomment the
`sonicTestnet` import in `RainbowWeb3Provider.tsx`.

---

## Market Data Flow

```
Browser
  │
  ├── Server page (page.tsx / market/[id]/page.tsx)
  │     └── apiFetch("/markets?chain=avalanche")
  │               │
  │               ▼
  │           Cloudflare Worker
  │           GET /markets?chain=avalanche
  │           → in-memory cache (30s) → viem readContract → D1
  │
  └── Client page (market/page.tsx — browse)
        └── loadMarketsWithSource(chain)
              1. apiFetch("/markets?chain=...") — backend
              2. loadMarketsWithSource fallback — empty
```

The homepage uses `export const revalidate = 15` for ISR. The market detail page uses
`dynamicParams = true` and `revalidate = 15` to serve live on-chain markets not
in `generateStaticParams`.

---

## Trade Flow

```
User enters amount in TradePanel
  → handleBuy()
  → client.buyShares({ marketId, outcomeIndex, amount })
      → AvalancheMarketClient.buyShares()
          → walletClient.writeContract({ value: parseEther(amount) })
          → MetaMask prompts user
          → publicClient.waitForTransactionReceipt()
  → window.dispatchEvent("predict-me:buy")   ← PositionCard auto-refreshes
```

---

## Admin Flow

```
/admin page loads
  → loadMarketsWithSource(chain)  ← fetches live markets from backend
  → lists markets with Resolve / Cancel buttons

handleResolve(marketId, outcomeIndex)
  → client.resolveMarket({ marketId, winningOutcomeIndex: outcomeIndex })
      → AvalancheMarketClient.resolveMarket()
          → resolveLocalOutcomeIndex checks winningOutcomeIndex first
            (explicit !== undefined, not truthiness — index 0 is valid)
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL (http://127.0.0.1:8787 locally, production worker URL on Netlify) |
| `NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS` | `0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa` |
| `NEXT_PUBLIC_AVALANCHE_RPC_URL` | `https://api.avax-test.network/ext/bc/C/rpc` |

Sonic vars (`NEXT_PUBLIC_SONIC_*`) are commented out in `next.config.ts` and not required
for the current UI. They are preserved in `.env.example` for when Sonic is re-enabled.

---

## Known Limitations

| Limitation | Status |
|---|---|
| Leaderboard shows placeholder data | Real rankings from `chain_events` planned for v2 |
| Quests are static | Tracking system planned for v2 |
| Price chart only populates after trades | Requires backend to be running to record snapshots |
| Stellar wallet integration present but inactive | `lib/wallet.ts` and `lib/auth.ts` preserved for re-enable |
