# predict-me — Roadmap

A priority-ordered list of what's been built, what's being wired up, and what's planned next. No dates — this is a sequenced backlog, not a schedule.

> This file lives in the frontend repo as the most visible entry point to the project. It covers all three repos: [predict-me-frontend](https://github.com/SolveForgeHQ/predict-me-frontend), [predict-me-contracts](https://github.com/SolveForgeHQ/predict-me-contracts), and [predict-me-backend](https://github.com/SolveForgeHQ/predict-me-backend).

---

## v1 — Done

The UI prototype and project scaffolding are complete. All data is mocked; no real transactions are submitted yet.

**Frontend**
- ✅ `Done` — Market grid homepage with YES/NO odds bar, pool size, and time remaining per card
- ✅ `Done` — Market detail page: large question title, prominent odds bar, two-column layout (chart placeholder + sticky trade panel)
- ✅ `Done` — Buy YES / Buy NO trade panel with amount input and estimated shares display
- ✅ `Done` — Your Position card showing fake YES/NO share balances
- ✅ `Done` — Admin page: create market form (question + end date) and resolve YES/NO buttons
- ✅ `Done` — Floating glass navbar with Markets and Admin links
- ✅ `Done` — Connect Wallet button (UI only — no wallet logic wired yet)
- ✅ `Done` — Mock market data in `lib/mockData.ts` (6 markets across Sports, Crypto, Finance, Tech)
- ✅ `Done` — Typed interfaces in `lib/types.ts` mirroring the contract's `MarketState`
- ✅ `Done` — Soroban RPC call stubs in `lib/contract.ts` (all functions return null with console.warn)
- ✅ `Done` — Freighter wallet stubs in `lib/wallet.ts` (connectWallet, signTransaction return null)
- ✅ `Done` — CI workflow: lint + build on every push and PR

**Contracts**
- ✅ `Done` — Contract interface defined: `create_market`, `buy_shares`, `resolve_market`, `claim_winnings`
- ✅ `Done` — Storage schema designed: `DataKey` enum, `MarketState` struct in `storage.rs`
- ✅ `Done` — Pooled betting model: flat 1:1 XLM shares, proportional payout on claim
- ✅ `Done` — Manual resolution model: admin-only `resolve_market`, no oracle
- ✅ `Done` — Native XLM collateral (no USDC, no wrapped assets)
- ✅ `Done` — Integration test plan documented in `tests/market_test.rs`
- ✅ `Done` — CI workflow: build + test on every push and PR

**Backend**
- ✅ `Done` — Express + TypeScript scaffold: `GET /health`, `GET /markets`, `GET /markets/:id`
- ✅ `Done` — Soroban RPC service layer in `services/stellar.ts` using `simulateTransaction`
- ✅ `Done` — Data normalisation: stroops → XLM, status code → string, Unix ts → ISO 8601
- ✅ `Done` — Graceful degradation: returns `[]` when contract is not yet deployed
- ✅ `Done` — CI workflow: lint + typecheck + build on every push and PR

**Repo health**
- ✅ `Done` — README, ARCHITECTURE, CONTRIBUTING in all three repos
- ✅ `Done` — PR templates and issue templates (bug report + feature request) in all three repos
- ✅ `Done` — MIT license in all three repos

---

## v1.5 — In Progress

Contract logic is being implemented and the frontend/backend are being wired to it.

**Contracts**
- 🔄 `In Progress` — Implement `storage.rs` accessors (`get_admin`, `next_market_id`, `get_market`, `set_market`, `get_shares`, `set_shares`)
- 🔄 `In Progress` — Add `#[contracterror]` enum to replace `panic!()` stubs with typed errors
- 🔄 `In Progress` — Implement `create_market` business logic with admin check
- 🔄 `In Progress` — Implement `buy_shares` with XLM token transfer and pool tracking
- 🔄 `In Progress` — Implement `resolve_market` with admin check and timestamp guard
- 🔄 `In Progress` — Implement `claim_winnings` with proportional payout calculation
- 🔄 `In Progress` — Write unit and integration tests for all contract functions
- 🔄 `In Progress` — Deploy contract to Stellar Testnet

**Frontend — contract integration**
- 🔄 `In Progress` — Wire `ConnectWalletButton` to `StellarWalletsKit` via `lib/wallet.ts`
- 🔄 `In Progress` — Add wallet state to React context so connected address is shared across components
- 🔄 `In Progress` — Live market fetching on homepage — replace `MOCK_MARKETS` with `fetchMarkets()` from `lib/contract.ts`
- 🔄 `In Progress` — Live market detail — replace `getMockMarket(id)` with `fetchMarket(id)` from `lib/contract.ts`
- 🔄 `In Progress` — Real `buy_shares` calls with pending/confirming UI state — wire `BuyPanel` handlers to `buyShares()` in `lib/contract.ts`
- 🔄 `In Progress` — Real position reading — implement `fetchPosition(marketId, publicKey)` and feed to `PositionCard`
- 🔄 `In Progress` — Admin `create_market` and `resolve_market` restricted to owner wallet — check connected address against contract admin before showing controls
- 🔄 `In Progress` — Claim Winnings button on resolved market detail page — wire to `claimWinnings()` in `lib/contract.ts`
- 🔄 `In Progress` — Basic error handling for wallet and transaction failures — surface rejection, timeout, and RPC errors in the UI

**Backend**
- 🔄 `In Progress` — Connect backend to deployed testnet contract (set `MARKET_CONTRACT_ID` in env)
- 🔄 `In Progress` — Verify end-to-end: `GET /markets` returns live data from the contract
- 🔄 `In Progress` — Point frontend at backend instead of querying Soroban directly from browser

---

## v2 — Planned

Larger features that require the v1.5 integration to be stable first.

**Pricing**
- 📋 `Planned` — AMM-based dynamic pricing (LMSR or constant-product) replacing flat 1 XLM per share
- 📋 `Planned` — Real-time odds that change as shares are bought on either side

**Markets**
- 📋 `Planned` — Multi-outcome markets (more than binary YES/NO)
- 📋 `Planned` — Market categories filter and search on the homepage
- 📋 `Planned` — Market creation open to any wallet (not admin-only)

**Resolution**
- 📋 `Planned` — Decentralised oracle integration for automated, trustless resolution
- 📋 `Planned` — Dispute window: challenge period after resolution before funds are released
- 📋 `Planned` — Protocol fee on winnings (configurable at deploy time)

**Frontend**
- 📋 `Planned` — Portfolio / positions page showing all open and settled positions for connected wallet
- 📋 `Planned` — Real price history chart on market detail page (replacing fake sparkline)
- 📋 `Planned` — Top bar shows truncated wallet address when connected
- 📋 `Planned` — Leaderboard page — currently a placeholder nav destination with mock data; needs real on-chain ranking by profit/win rate
- 📋 `Planned` — Quests page — currently a placeholder nav destination; needs real quest tracking, spin-wheel mechanic, and points system wired to wallet activity
- 📋 `Planned` — News page — currently a placeholder nav destination with hardcoded articles; needs live feed integration or curated content API

**Backend**
- 📋 `Planned` — In-memory TTL cache for `GET /markets` to reduce RPC load
- 📋 `Planned` — `GET /markets/:id/positions/:address` route for wallet share balances
- 📋 `Planned` — Contract event indexing via Stellar event streaming (replace polling)
- 📋 `Planned` — WebSocket endpoint for live odds updates to connected frontend clients
- 📋 `Planned` — Rate limiting on RPC-heavy routes

---

## Ideas — Not Committed

Speculative or lower-priority work that's been considered but isn't planned yet.

- 💡 `Idea` — Secondary market: allow users to sell positions before resolution
- 💡 `Idea` — Liquidity provision: let wallets add liquidity to a market and earn a share of fees
- 💡 `Idea` — Off-chain market metadata: images, source article URLs, tags stored in the backend database
- 💡 `Idea` — Mobile-first PWA with push notifications when a market you hold resolves
- 💡 `Idea` — Multi-collateral support: USDC or other Stellar assets alongside XLM
- 💡 `Idea` — DAO governance for fee parameters and oracle selection
- 💡 `Idea` — Mainnet deployment after extended testnet period
