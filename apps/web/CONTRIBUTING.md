# Contributing to predict-me Frontend

Thanks for contributing to the predict-me frontend. This guide covers setup, the component model, what needs to be wired up, and the PR workflow.

---

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10 — `npm i -g pnpm`
- [Freighter](https://freighter.app) browser extension (for testing wallet flows once wired up)

---

## Getting Started

```bash
git clone https://github.com/SolveForgeHQ/predict-me-frontend.git
cd predict-me-frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Create a feature branch:

```bash
git checkout -b feat/your-feature
```

---

## Daily Commands

```bash
pnpm dev      # dev server at localhost:3000
pnpm build    # production build — run before opening a PR
pnpm lint     # ESLint
```

---

## What Needs to Be Built

The UI is complete. These integration layers are stubbed and waiting:

### 1. Wallet connection — `lib/wallet.ts` + `components/ConnectWalletButton.tsx`

- Initialise `StellarWalletsKit` from `@creit.tech/stellar-wallets-kit`
- Call `kit.openModal()` from `ConnectWalletButton` on click
- Store the returned `publicKey` in a React context or Zustand store
- Export `signTransaction(xdr)` from `lib/wallet.ts` using `kit.sign()`
- Update `Navbar.tsx` to show truncated address when connected

### 2. Contract reads — `lib/contract.ts`

- Implement `fetchMarkets()` — replaces `MOCK_MARKETS` on the homepage
- Implement `fetchMarket(id)` — replaces `getMockMarket(id)` on the detail page
- Implement `fetchPosition(marketId, publicKey)` — feeds `<PositionCard>`

### 3. Contract writes — `lib/contract.ts` + `components/BuyPanel.tsx`

- Implement `buyShares(marketId, side, amount)` — call from `BuyPanel.handleBuyYes/No`
- Implement `createMarket` and `resolveMarket` — call from `app/admin/page.tsx`
- Implement `claimWinnings` — add a Claim button on the market detail page

---

## File Responsibilities

| File | Purpose |
|---|---|
| `lib/types.ts` | Interfaces — edit here when the contract schema changes |
| `lib/mockData.ts` | Static data — remove usages as contract functions are implemented |
| `lib/contract.ts` | All Soroban RPC calls — the only file that imports `stellar-sdk` for transactions |
| `lib/wallet.ts` | All Freighter logic — the only file that imports `stellar-wallets-kit` |
| `components/BuyPanel.tsx` | Trade UI — do not add contract logic here, call `lib/contract.ts` |
| `components/ConnectWalletButton.tsx` | Wallet button — do not add kit logic here, call `lib/wallet.ts` |

---

## Component Rules

- **Server vs client:** keep components as Server Components unless they need `useState`, `useEffect`, or browser APIs. Add `"use client"` only when required.
- **No event handlers in Server Components:** hover effects use inline `<style>` tags (see `MarketCard.tsx`), not `onMouseEnter`/`onMouseLeave`.
- **No `env.storage()` in components:** all data fetching goes through `lib/contract.ts`.
- **Types first:** any new data shape goes into `lib/types.ts` before the component is written.

---

## Code Standards

- ESLint config is in `eslint.config.mjs` — `pnpm lint` must pass
- `pnpm build` must succeed with no TypeScript errors
- No `any` types — use the interfaces in `lib/types.ts`
- New components go in `components/`, new data/integration logic goes in `lib/`

---

## Pull Requests

- One feature per PR
- Run `pnpm build` and `pnpm lint` before pushing
- PR description should cover: what was added, what mock data was removed, any new env vars required

---

## Commit Style

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`

Examples:
```
feat: wire connectWallet to StellarWalletsKit
feat: implement fetchMarkets from contract
fix: correct estimated shares calculation in BuyPanel
chore: remove MOCK_MARKETS from homepage
```

---

## Questions

Open an issue or discussion on [GitHub](https://github.com/SolveForgeHQ/predict-me-frontend).
