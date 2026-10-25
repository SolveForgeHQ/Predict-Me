# Leaderboard Architecture & Ranking System

This document outlines the end-to-end design of the `predict-me` leaderboard: how on-chain activity is indexed into SQLite (Cloudflare D1), how ranking metrics and profit math are computed deterministically, how the REST API serves data, how to run the indexer locally, and known production constraints.

---

## 1. End-to-End Flow: Event → Database → API → UI

```
┌───────────────────────────────┐
│  Sonic Testnet Smart Contract │
│   (PredictionMarketERC20.sol) │
└──────────────┬────────────────┘
               │ Emits logs (SharesBought, MarketResolved, etc.)
               ▼
┌───────────────────────────────┐
│ Cloudflare Scheduled Worker   │
│   (backend/src/indexer/)      │
│   • Runs every 60s cron       │
│   • Viem getLogs RPC scan     │
│   • Range chunking & retries  │
└──────────────┬────────────────┘
               │ Inserts raw events & updates indexer_state
               ▼
┌───────────────────────────────┐
│ Cloudflare D1 (SQLite)        │
│   • chain_events table        │
│   • indexer_state table       │
└──────────────┬────────────────┘
               │ Query chain_events for target chain
               ▼
┌───────────────────────────────┐
│ Stats Engine & Hono API       │
│   (backend/src/stats/ & src/routes/)
│   • computeLeaderboard()      │
│   • computeWalletStats()      │
│   • In-memory 60s cache       │
└──────────────┬────────────────┘
               │ GET /leaderboard & GET /stats/:wallet
               ▼
┌───────────────────────────────┐
│ Next.js Frontend              │
│   (apps/web/app/leaderboard)  │
│   • "This week" / "All time"  │
│   • Highlight connected user  │
│   • "Your stats" qualification│
└───────────────────────────────┘
```

1. **On-chain event emission**: Users trade on prediction markets via `PredictionMarketERC20.sol`. The contract emits standard indexed EVM events: `MarketCreated`, `SharesBought`, `MarketResolved`, `MarketCancelled`, `WinningsClaimed`, and `Refunded`.
2. **Scheduled indexer**: Cloudflare Scheduled Workers trigger every minute (`* * * * *`). The Sonic indexer reads the last processed block from `indexer_state` (or defaults to `SONIC_START_BLOCK`), fetches logs in bounded chunks via public JSON-RPC, decodes topics and arguments, and writes them to the `chain_events` table in Cloudflare D1. Idempotency is guaranteed by the unique constraint on `(chain, tx_hash, log_index)`.
3. **Stat computation**: When `/leaderboard` or `/stats/:wallet` is requested, the backend queries raw `chain_events` for that chain and passes them into pure TypeScript calculation functions (`computeLeaderboard` / `computeWalletStats`). There are **no database queries inside the mathematical ranking engine**, making it deterministic, isolated, and easy to unit test.
4. **Caching & delivery**: API responses are cached in memory for 60 seconds with `Cache-Control: public, max-age=60` headers to shield the D1 database from redundant load.
5. **Frontend rendering**: The Next.js dApp displays ranked rows, token-formatted net profits, win rates, and links to the Sonic block explorer (`testnet.sonicscan.org`). If the connected wallet has not yet reached the qualification threshold, a dedicated "Your stats" card explains how many more resolved markets are needed.

---

## 2. Ranking Rules & Math

All calculations operate strictly on native base units using JavaScript `BigInt` arithmetic to avoid floating-point rounding errors.

### Rule 1: Market Resolution & Cancellation
- **Only markets with a `MarketResolved` event count.**
- **Cancelled markets (`MarketCancelled`) are ignored completely.** If a market is cancelled, all buy events and refunds for that market are excluded from volume, wins, and profit.
- Open (unresolved) markets are ignored until resolution.

### Rule 2: Stake & Entitled Payout Calculation
For each wallet and resolved market:
- **Total Stake**:
  $$\text{total\_stake} = \sum \text{amount of all SharesBought by this wallet on this market}$$
- **Entitled Payout**:
  $$\text{entitled\_payout} = \frac{\text{wallet\_winning\_stake} \times \text{market\_total\_pool}}{\text{market\_winning\_pool}}$$
- **Unclaimed Winners Count**: We do **NOT** rely on `WinningsClaimed` events to calculate profit. A winning trader is credited with their full entitled payout as soon as `MarketResolved` is indexed. `WinningsClaimed` is only tracked to record whether funds have been withdrawn (`hasClaimed`).

### Rule 3: Net Profit
$$\text{net\_profit} = \text{entitled\_payout} - \text{total\_stake}$$
- `net_profit` can be positive (green in UI), zero, or negative (red in UI).
- In API responses, amounts are always serialized as **strings** of base units (e.g. `"50000000"` for $50 USDC with 6 decimals).

### Rule 4: What Counts as a Win
- A "win" is recorded **only when $\text{entitled\_payout} > \text{total\_stake}$**.
- **Hedging / backing both sides**: If a wallet backs both YES and NO and their gross return does not strictly exceed their total stake across both sides, they receive **0 wins** for that market.

### Rule 5: Win Rate
$$\text{win\_rate} = \frac{\text{wins}}{\text{resolved\_markets\_participated}}$$
- Expressed as a float between `0.0` and `1.0` in the API, and formatted as a percentage (e.g. `74%`) on the frontend.

### Rule 6: Season Window (UTC Week)
- A market belongs to the season in which its `MarketResolved` `block_time` occurs.
- A season is an ISO 8601 UTC week (starting Monday at 00:00:00 UTC and ending Sunday at 23:59:59.999 UTC), represented as `YYYY-Www` (e.g. `2026-W43`).
- **Endpoints support**:
  - `season=all`: All-time cumulative history.
  - `season=current`: Automatically resolves to the current active UTC week.
  - `season=YYYY-Www`: Any explicit past week identifier.

### Rule 7: Minimum Market Qualification Threshold
- A wallet appears on the public profit leaderboard only after participating in at least **`MIN_RESOLVED_MARKETS`** (constant default: **5**, configurable via `min_resolved_markets` query param).
- Wallets with 1 to 4 resolved markets can still view their numbers through `GET /stats/:wallet`:
  - Returns `rank: null`
  - Returns `markets_needed: 5 - resolved_markets`
  - Returns their actual `net_profit`, `win_rate`, and total payout

### Rule 8: Ranking Order & Tie-Breaking
1. **Primary**: `net_profit` descending (highest profit first).
2. **First tie-breaker**: `resolved_markets_count` descending (trader with more resolved markets ranks higher).
3. **Second tie-breaker**: `first_activity_time` ascending (trader who made their first transaction earlier ranks higher).

---

## 3. Environment Variables

Defined in `backend/wrangler.toml` (and overridden in CI/production via Cloudflare secrets):

| Variable | Type | Description | Example / Default |
|---|---|---|---|
| `SONIC_START_BLOCK` | Integer string | The block where `PredictionMarketERC20` was deployed. When `indexer_state` is empty, the indexer begins scanning here instead of genesis (0). | `"19241084"` |
| `SONIC_RPC_URL` | URL | Public JSON-RPC endpoint for Sonic testnet. | `"https://rpc.testnet.soniclabs.com"` |
| `SONIC_CONTRACT_ADDRESS` | EVM Address | Live `PredictionMarketERC20` contract address on Sonic. | `"0x25D035CB295d94A073107aAB9Ac86a3655a5614E"` |
| `SONIC_TOKEN_ADDRESS` | EVM Address | ERC-20 payment token used for stakes (Mock USDC, 6 decimals). | `"0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02"` |
| `AVALANCHE_START_BLOCK` | Integer string | Deployment block for Avalanche Fuji market contract. | `"59915671"` |
| `AVALANCHE_RPC_URL` | URL | RPC endpoint for Avalanche Fuji C-Chain. | `"https://api.avax-test.network/ext/bc/C/rpc"` |
| `AVALANCHE_CONTRACT_ADDRESS` | EVM Address | Live Solidity prediction market contract on Fuji. | `"0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa"` |
| `SOROBAN_RPC_URL` | URL | Stellar Soroban RPC node. | `"https://soroban-testnet.stellar.org"` |
| `MARKET_CONTRACT_ID` | StrKey C... | Soroban Prediction Market contract ID on Stellar testnet. | `"CCGM6LQRQNQGMUXMXHICCH73CDBYOTMV5LEJ7J..."` |
| `FRONTEND_ORIGIN` | Comma-delimited | Allowed CORS origins for browser cookies and API queries. | `"https://predict-me.netlify.app,http://localhost:3000"` |
| `JWT_SECRET` | String | Secret key for signing session tokens. | `"dev-secret-change-me-in-production"` |

---

## 4. Running the Indexer & Backend Locally

### 1. Apply D1 Database Migrations
Make sure your local SQLite database has the latest tables (`chain_events`, `indexer_state`):
```bash
pnpm --filter backend exec wrangler d1 migrations apply DB --local
```

### 2. Start the Backend Worker
```bash
pnpm dev:backend
```
This runs Wrangler with the `--test-scheduled` flag on `http://127.0.0.1:8787`.

### 3. Trigger an Indexer Scan Cycle
Because cron jobs run automatically in production Cloudflare Workers but not in local Miniflare, trigger an indexing cycle manually via curl:
```bash
curl "http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*"
```
Console logs will output the progress:
```text
[sonic-indexer] ranges=1 decoded=2 inserted=2 blocks=19255000→19255200
```

### 4. Verify Stored Events & Indexer State
```bash
curl http://127.0.0.1:8787/debug/events
```
Returns a breakdown of indexed events grouped by name and current checkpoint blocks.

### 5. Query the Leaderboard API
```bash
# Query all-time leaderboard on Sonic (allowing 1 market threshold for local testing)
curl "http://127.0.0.1:8787/leaderboard?chain=sonic&min_resolved_markets=1"

# Query user stats for a specific wallet
curl "http://127.0.0.1:8787/stats/0xf58bfb2853b95e437511263eb148169e7fdeffe2?chain=sonic"
```

---

## 5. Known Limitations & Architecture Notes

1. **Sonic-focused Leaderboard**: While the project supports Stellar and Avalanche markets, the ERC-20 profit leaderboard currently runs against Sonic testnet. Avalanche Fuji's public RPC imposes a strict 100-block log filter limit, and Stellar Soroban uses a ledger-ingestion model requiring dedicated RPC subscriptions.
2. **Pseudonymous Identity**: Leaderboard entries are keyed exclusively by on-chain public addresses (`0x...`). User handles and avatars created under `/users/me` are matched client-side and never override raw cryptographic wallet identity.
3. **Public RPC Rate Limiting**: The public Sonic testnet RPC (`rpc.testnet.soniclabs.com`) enforces request rate limits. To avoid HTTP 429 errors:
   - Block range scanning is capped to small batches (`BLOCK_RANGE_SIZE = 100`, `MAX_RANGES_PER_RUN = 5`).
   - Exponential backoff is built into RPC log queries.
   - For high-throughput mainnet production, replace `SONIC_RPC_URL` with a dedicated provider endpoint (e.g., Alchemy, QuickNode, or private node).
