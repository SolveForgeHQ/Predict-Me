# predict-me Frontend — Architecture

Architecture of the predict-me Next.js frontend. This document covers page structure, component responsibilities, the contract integration layer, and how data flows through the app.

---

## Overview

The frontend is a Next.js 16 App Router application. Pages are Server Components by default; interactive pieces are isolated into `"use client"` components. Currently all data is mocked in `lib/mockData.ts`. When the Soroban contract is deployed, `lib/contract.ts` stubs are replaced with real RPC calls and `lib/wallet.ts` stubs are replaced with Freighter signing logic.

---

## How It Connects to the Contract

```
Browser
  │
  ▼
Next.js App (this repo)
  ├── Server pages: read MOCK_MARKETS (later: fetchMarkets() via stellar-sdk)
  └── Client components (BuyPanel, Admin)
        │
        ├── lib/contract.ts  ←  builds InvokeContractFunction XDR
        │
        └── lib/wallet.ts    ←  signs XDR via Freighter
              │
              ▼
        @stellar/stellar-sdk
        server.submitTransaction(signedXDR)
              │
              ▼
        Soroban RPC  (NEXT_PUBLIC_SOROBAN_RPC_URL)
              │
              ▼
        predict-me contract on Stellar Testnet
```

---

## Source Layout

```
frontend/
├── app/
│   ├── page.tsx               Homepage
│   ├── market/[id]/
│   │   ├── page.tsx           Market detail (server)
│   │   └── TradePanel.tsx     Trade inputs (client)
│   ├── admin/page.tsx         Admin panel (client)
│   ├── layout.tsx             Root layout
│   └── globals.css            CSS variables + dark theme
│
├── components/
│   ├── Navbar.tsx             [client] — floating glass pill, usePathname
│   ├── MarketCard.tsx         [server] — CSS-only hover, no event handlers
│   ├── MarketGrid.tsx         [server] — wraps MarketCard[], accepts Market[]
│   ├── BuyPanel.tsx           [client] — YES/NO inputs, stub buy handlers
│   ├── PositionCard.tsx       [client] — share balance display, mock zeros
│   └── ConnectWalletButton.tsx [client] — wallet button, stub onClick
│
└── lib/
    ├── types.ts               Market, Position, WalletState interfaces
    ├── mockData.ts            MOCK_MARKETS[] static data
    ├── markets.ts             formatPool(), timeRemaining() helpers
    ├── contract.ts            Soroban RPC stubs
    └── wallet.ts              Freighter connection stubs
```

---

## Pages

### `/` — Homepage (`app/page.tsx`)

Server component. Imports `MOCK_MARKETS` from `lib/mockData.ts`, renders a stats bar (market count, total volume) and a `<MarketGrid>` of `<MarketCard>` components. Static — no client state or hydration. When contract is live, replace `MOCK_MARKETS` with `await fetchMarkets()` from `lib/contract.ts`.

### `/market/[id]` — Market Detail (`app/market/[id]/page.tsx`)

Server component. Calls `getMockMarket(id)` — returns 404 if not found. `generateStaticParams` pre-renders all 6 mock ids. Renders: category label → large question heading → prominent YES/NO odds bar → two-column layout (left: chart placeholder + stats, right: sticky `<BuyPanel>` + `<PositionCard>`).

`TradePanel.tsx` in this directory is an older inline version of the trade UI. The canonical component is `components/BuyPanel.tsx`.

### `/admin` — Admin (`app/admin/page.tsx`)

Client component. Holds all state in `useState` — no persistence. Create Market appends a new `Market` object to local state. Resolve YES/NO flips the `status` field. When contract is live, replace state mutations with `createMarket()` and `resolveMarket()` from `lib/contract.ts`.

---

## Components

| Component | Type | Responsibility |
|---|---|---|
| `Navbar` | client | Floating pill. Uses `usePathname` for active link highlight. `ConnectWalletButton` embedded. |
| `MarketCard` | server | Single market card. Hover effect via inline `<style>` tag (no JS event handlers, stays server-safe). |
| `MarketGrid` | server | Grid wrapper. Accepts `Market[]` prop — decoupled from data source. |
| `BuyPanel` | client | YES/NO amount inputs. Computes estimated shares as `amount / (percent / 100)`. `handleBuyYes` / `handleBuyNo` are stubs. |
| `PositionCard` | client | Shows `yesShares`, `noShares`, avg prices from a `Position` prop. Defaults to `EMPTY` (all zeros). |
| `ConnectWalletButton` | client | Static button. `handleClick` logs a warning. Wire to `connectWallet()` in `lib/wallet.ts`. |

---

## Library Layer

### `lib/types.ts`
Single source of truth for TypeScript interfaces. `Market` mirrors the contract's `MarketState`. `Position` mirrors the `Shares` storage entries. `WalletState` tracks the Freighter connection.

### `lib/mockData.ts`
`MOCK_MARKETS[]` — 6 hardcoded markets across Sports, Crypto, Finance, Tech categories. Also exports `getMockMarket(id)`. Replace usages with `fetchMarkets()` / `fetchMarket()` from `lib/contract.ts` once the contract is deployed.

### `lib/contract.ts`
All Soroban RPC call stubs. Each function logs a `console.warn` and returns `null`. Functions: `fetchMarkets`, `fetchMarket`, `fetchPosition`, `buyShares`, `createMarket`, `resolveMarket`, `claimWinnings`. Reads `NEXT_PUBLIC_MARKET_CONTRACT_ID` and `NEXT_PUBLIC_SOROBAN_RPC_URL` from env.

### `lib/wallet.ts`
Freighter connection stubs. Functions: `getWalletState`, `connectWallet`, `disconnectWallet`, `signTransaction`. Intended to wrap `@creit.tech/stellar-wallets-kit`. All log warnings and return `null`.

---

## Data Flow

**Current (mock):**
```
app/page.tsx
  → imports MOCK_MARKETS from lib/mockData.ts
  → passes to <MarketGrid markets={MOCK_MARKETS} />
  → renders <MarketCard> for each
```

**Target (with contract):**
```
app/page.tsx
  → await fetchMarkets()  from lib/contract.ts
      → StellarSdk.SorobanRpc.Server(RPC_URL)
      → simulate invokeContractFunction(list_markets)
      → parse XDR response → Market[]
  → passes to <MarketGrid markets={markets} />
```

**Buy shares flow (target):**
```
User types amount in BuyPanel
  → handleBuyYes() called
  → buyShares(market.id, "YES", amount) in lib/contract.ts
      → build InvokeContractFunction op
      → simulate → get footprint
      → signTransaction(xdr) in lib/wallet.ts
          → kit.sign(xdr) via Freighter
      → server.submitTransaction(signedXdr)
```

---

## Current Limitations

| Limitation | Status |
|---|---|
| All data is mocked | `MOCK_MARKETS` in `lib/mockData.ts` |
| Wallet connection is a stub | `lib/wallet.ts` logs and returns null |
| Buy/Sell submits nothing | `BuyPanel` handlers are stubs |
| Admin actions are local state only | No contract calls from `/admin` |
| `TradePanel.tsx` is a duplicate | `BuyPanel.tsx` is the canonical component |
| No React context for wallet state | `WalletState` not shared across components |

---

## Related Repos

- **Contracts:** [predict-me-contracts](https://github.com/SolveForgeHQ/predict-me-contracts)
