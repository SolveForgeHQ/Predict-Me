# predict-me — Architecture

## 1. Overview

predict-me is a prediction market dApp on Stellar Soroban. A user opens the app, connects their Freighter wallet, and browses a list of open markets — each framed as a binary YES/NO question with a real-world resolution date. To take a position the user enters an XLM amount in the Buy YES or Buy NO panel; the frontend signs and submits a `buy_shares` transaction through Freighter to the deployed Soroban contract on Stellar Testnet. The contract holds all collateral, records each user's share balance per side, and tracks the market's running YES/NO totals. When the resolution date passes, the designated admin wallet calls `resolve_market` with the winning outcome. Anyone who backed the correct side can then call `claim_winnings` to receive their proportional share of the total pool, minus a small protocol fee.

---

## 2. High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Browser / User                       │
└───────────────────────────┬─────────────────────────────┘
                            │  HTTP
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Next.js Frontend  (App Router)              │
│  /           market grid    reads MARKETS[] mock data    │
│  /market/[id]  trade panel  builds XDR transaction       │
│  /admin        create/resolve  builds XDR transaction    │
└──────────┬──────────────────────────────┬───────────────┘
           │  @creit.tech/stellar-wallets-kit              │
           │  sign transaction XDR                         │
           ▼                                               │
┌─────────────────────┐                                    │
│  Freighter Wallet   │                                    │
│  (browser extension)│                                    │
└──────────┬──────────┘                                    │
           │  signed XDR envelope                          │
           ▼                                               │
┌─────────────────────────────────────────────────────────┐
│         @stellar/stellar-sdk  (RPC client)               │
│         NEXT_PUBLIC_SOROBAN_RPC_URL                      │
└───────────────────────────┬─────────────────────────────┘
                            │  Soroban RPC / XDR
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Stellar Testnet / Soroban                   │
│         predict-me contract  (WASM, Rust)                │
│         holds XLM collateral, share ledger               │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Architecture

The frontend lives in `frontend/` and is a Next.js 16 App Router project. All pages are Server Components by default; interactive pieces are isolated into `"use client"` components.

```
frontend/
├── app/
│   ├── page.tsx                 Homepage — server component
│   ├── market/[id]/
│   │   ├── page.tsx             Market detail — server component
│   │   └── TradePanel.tsx       Buy YES / Buy NO inputs — CLIENT
│   ├── admin/page.tsx           Create + resolve markets — CLIENT
│   └── layout.tsx               Root shell; renders <Navbar />
├── components/
│   ├── Navbar.tsx               Floating glass pill — CLIENT
│   │                            (needs usePathname for active state)
│   └── MarketCard.tsx           Grid card — server component
│                                (hover handled via inline CSS, no JS)
└── lib/
    └── markets.ts               Shared Market type, MARKETS[] mock array,
                                 formatPool(), timeRemaining() helpers
```

**Page responsibilities**

| Route | Component | Responsibility |
|---|---|---|
| `/` | `app/page.tsx` | Renders stats bar + `<MarketCard>` grid from `MARKETS[]`. Static — no client state. |
| `/market/[id]` | `app/market/[id]/page.tsx` | Resolves market by id, renders odds bar + stats + `<TradePanel>` + position card. `generateStaticParams` pre-renders all 6 mock ids. |
| `/market/[id]` (trade) | `TradePanel.tsx` | Client component. Holds `yesAmount` / `noAmount` state. Computes estimated shares as `amount / (percent / 100)`. Buttons are wired up visually but submit no transaction yet. |
| `/admin` | `app/admin/page.tsx` | Client component. Holds `markets` in local React state. Create Market appends to that array. Resolve YES/NO flips `status` in state. Nothing is persisted or sent on-chain yet. |

**Wallet connection layer**

`@creit.tech/stellar-wallets-kit` and `@stellar/stellar-sdk` are installed as dependencies. The "Connect Wallet" button in `Navbar.tsx` is currently a static `<button>` — the integration hook point is there, but the kit initialisation and `sign()` / `submitTransaction()` calls are not wired up yet.

---

## 4. Smart Contract Architecture

> **Current state:** The contract in `contracts/contracts/hello-world/src/lib.rs` is the Soroban scaffold — a single `hello(to: String) -> Vec<String>` function. The market logic described below is the **intended design** for the contract that will replace this placeholder.

### Intended contract functions

```
create_market(question, end_timestamp, category) -> market_id
buy_shares(market_id, side, xlm_amount)
resolve_market(market_id, outcome)          // admin-only
claim_winnings(market_id)
```

#### `create_market`
- **Caller:** admin wallet only (checked against stored `admin` address)
- **Writes:** new `Market` entry to contract storage
  - `question: String`
  - `end_timestamp: u64`
  - `yes_pool: i128 = 0`
  - `no_pool: i128 = 0`
  - `status: Enum { Open, ResolvedYes, ResolvedNo }`
- **Returns:** auto-incremented `market_id: u32`

#### `buy_shares`
- **Caller:** any connected wallet
- **Reads:** market status (must be `Open`), current timestamp (must be `< end_timestamp`)
- **Writes:**
  - Increments `yes_pool` or `no_pool` by `xlm_amount`
  - Increments `shares[caller][market_id][side]` by `xlm_amount` (flat 1:1, no AMM)
- **Effect:** transfers XLM from caller to contract; contract holds collateral

#### `resolve_market`
- **Caller:** admin wallet only
- **Reads:** market status (must be `Open`), current timestamp (must be `>= end_timestamp`)
- **Writes:** sets market `status` to `ResolvedYes` or `ResolvedNo`
- **Effect:** no funds move; resolution just gates claim eligibility

#### `claim_winnings`
- **Caller:** any wallet with a winning position
- **Reads:**
  - Market `status` (must be `ResolvedYes` or `ResolvedNo`)
  - `shares[caller][market_id][winning_side]`
  - Total winning pool size
- **Writes:** zeroes out caller's share balance for that market
- **Effect:** transfers caller's proportional share of the total pool back as XLM
  - `payout = (caller_shares / winning_pool) * total_pool`

### Contract storage layout (planned)

```
DataKey::Admin                          -> Address
DataKey::MarketCount                    -> u32
DataKey::Market(market_id)             -> MarketState struct
DataKey::Shares(market_id, addr, side) -> i128
```

---

## 5. Data Flow — Full Market Lifecycle

```
1. ADMIN CREATES MARKET
   Admin wallet  -->  /admin page  -->  create_market(question, end_ts)
   Contract writes: Market { status: Open, yes_pool: 0, no_pool: 0 }

2. USERS BROWSE
   Browser  -->  GET /  (or /market/[id])
   Frontend reads MARKETS[] (mock) or will query contract via stellar-sdk
   Displays YES% / NO% derived from yes_pool / (yes_pool + no_pool)

3. USER BUYS SHARES
   User enters $amount in TradePanel  -->  clicks "Buy YES"
   Frontend builds InvokeContractOp  -->  buy_shares(market_id, YES, amount)
   Freighter signs XDR envelope
   stellar-sdk submits to Soroban RPC
   Contract: yes_pool += amount, shares[user][id][YES] += amount
   XLM transferred from user to contract

4. MARKET RESOLVES
   Resolution date passes
   Admin opens /admin  -->  clicks "Resolve YES"
   Frontend builds InvokeContractOp  -->  resolve_market(market_id, YES)
   Contract: status = ResolvedYes
   (no funds move at this step)

5. WINNER CLAIMS
   Winning user opens /market/[id]  -->  clicks "Claim Winnings"
   Frontend builds InvokeContractOp  -->  claim_winnings(market_id)
   Contract reads: user's yes_shares, total yes_pool, total_pool
   Calculates: payout = (user_yes_shares / yes_pool) * total_pool
   Contract transfers payout XLM back to user
   shares[user][id][YES] zeroed out
```

---

## 6. Trust Assumptions

**Manual resolution (no oracle)**
In v1 the `resolve_market` function is callable only by the hardcoded `admin` address stored in the contract at deploy time. There is no on-chain verification of the real-world outcome — the admin is trusted to call the correct side. This is a significant centralisation point and is accepted intentionally for the prototype.

**Fixed-ratio pricing (no AMM)**
Share price is not determined by a bonding curve or automated market maker. Every share costs exactly `1 XLM` regardless of how many shares have been bought. The YES% and NO% figures shown in the UI are computed as `yes_pool / total_pool` — they reflect the distribution of capital, not an independent probability estimate derived from a pricing function. There is no slippage and no liquidity depth.

**Native XLM collateral only**
All positions are denominated in XLM (Stellar's native asset). No USDC, no wrapped assets, no multi-collateral support. The contract escrows raw XLM and returns raw XLM on claim.

**No access control on `/admin`**
The `/admin` route in the frontend is unprotected. Any user who navigates to it can submit `create_market` and `resolve_market` calls. The contract enforces the admin check on-chain, so unauthorised calls will be rejected at the contract level — but the UI offers no guard.

---

## 7. Known Limitations (Intentionally Deferred)

| Limitation | Notes |
|---|---|
| **No decentralised oracle** | Resolution is manual by the admin key. UMA, Chainlink, or a Stellar-native attestation layer would replace this in a production version. |
| **No AMM / bonding curve pricing** | Shares are priced at a flat rate. A constant-product or LMSR market maker would give more accurate probability signals and prevent trivial arbitrage. |
| **No dispute resolution** | If the admin resolves incorrectly there is no challenge window or appeal mechanism. |
| **No protocol fee** | The payout formula currently returns 100% of the pool to winners. A fee parameter should be added before mainnet. |
| **No liquidity provision** | Users cannot add liquidity or earn fees as market makers. |
| **No position trading / secondary market** | Shares are non-transferable in v1. You cannot sell your position before resolution. |
| **Admin route is unguarded on the frontend** | Any user can reach `/admin`. Only the contract enforces access control. |
| **Mock data only** | `frontend/lib/markets.ts` exports a hardcoded `MARKETS[]` array. No contract reads are wired up yet — the frontend does not reflect real on-chain state. |
| **No testnet deployment** | The contract in `contracts/contracts/hello-world` is the Soroban scaffold. A real market contract has not been written or deployed yet. |
