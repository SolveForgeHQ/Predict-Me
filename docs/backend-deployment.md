# Backend Deployment Guide

This document covers deploying the Predict-Me backend (a Cloudflare Worker) to production.
The backend indexes two chains — **Sonic testnet** and **Avalanche Fuji** — and stores all
events in a Cloudflare D1 database.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | https://nodejs.org |
| pnpm | ≥ 8 | `npm i -g pnpm` |
| Wrangler | ≥ 3 | `pnpm add -g wrangler` |

Log in to Cloudflare once:

```bash
wrangler login
```

---

## Environment Variables

### Non-secret vars (`wrangler.toml` → `[vars]`)

These are committed and version-controlled:

| Variable | Description |
|---|---|
| `SONIC_RPC_URL` | Sonic testnet JSON-RPC endpoint |
| `SONIC_START_BLOCK` | First block to index on Sonic |
| `SONIC_CONTRACT_ADDRESS` | Predict-Me contract address on Sonic |
| `SONIC_TOKEN_ADDRESS` | USDC/token address on Sonic |
| `AVALANCHE_RPC_URL` | Avalanche Fuji JSON-RPC endpoint |
| `AVALANCHE_START_BLOCK` | First block to index on Avalanche Fuji |
| `AVALANCHE_CONTRACT_ADDRESS` | Predict-Me contract address on Avalanche Fuji |
| `FRONTEND_ORIGIN` | Allowed CORS origin (e.g. `https://predict-me.app`) |

### Secrets (never in `wrangler.toml`)

Set each secret with Wrangler — they are stored encrypted in Cloudflare's vault:

```bash
wrangler secret put JWT_SECRET
# paste the value at the prompt
```

---

## Local Development

1. Copy `.dev.vars.example` to `.dev.vars` and fill in real values:

```bash
cp backend/.dev.vars.example backend/.dev.vars
```

2. Start the local dev server (from repo root):

```bash
pnpm dev:backend
# or directly:
cd backend && pnpm dev
```

This runs `wrangler dev --test-scheduled`, which lets you trigger the cron handler
by visiting `http://localhost:8787/__scheduled?cron=*+*+*+*+*`.

---

## Database Migrations

The D1 database ID is **`34402d4b-3454-406f-aef4-e36aa9ae2cd8`** (bound as `DB` in `wrangler.toml`).

Apply pending migrations to the **remote** (production) database before deploying:

```bash
cd backend
pnpm exec wrangler d1 migrations apply DB --remote
```

For local development, apply against the local D1:

```bash
pnpm exec wrangler d1 migrations apply DB --local
```

---

## Deploying

### Dry-run (validates config without uploading)

```bash
cd backend
pnpm exec wrangler deploy --dry-run
# or from repo root:
pnpm --filter backend exec wrangler deploy --dry-run
```

### Production deploy

```bash
cd backend
pnpm exec wrangler deploy
```

Wrangler will output the Worker URL (e.g. `https://predict-me-backend.<account>.workers.dev`).

---

## Verifying the Deployment

Tail live logs:

```bash
wrangler tail
```

Check the health endpoint:

```bash
curl https://predict-me-backend.<account>.workers.dev/health
```

Manually trigger a scheduled indexer run (useful right after first deploy to bootstrap):

```bash
curl "https://predict-me-backend.<account>.workers.dev/__scheduled?cron=*+*+*+*+*"
# Note: this endpoint is only reachable when workers.dev preview is enabled or via Wrangler local dev.
# In production, trigger via: wrangler dev --remote and visit the __scheduled URL.
```

---

## Subrequest Budget & Backfill Calculations

Cloudflare Workers **Free plan** allows **50 subrequests per execution**.

Each scheduled cron run (triggered every minute) is split across both chains:

| Chain | Block range/run | Subrequests (worst case) |
|---|---|---|
| Sonic testnet | 5 × 1,000 = 5,000 blocks | 1 (getBlockNumber) + 5 (getLogs) + ≤5 (timestamps) = **11** |
| Avalanche Fuji | 20 × 100 = 2,000 blocks | 1 (getBlockNumber) + 20 (getLogs) + ≤5 (timestamps) = **26** |
| **Total** | — | **≤ 37** (13 under the 50 limit) |

Both indexers save a checkpoint after **every individual range**, so a crash or timeout
never reprocesses already-indexed blocks.

### 16,000-block backfill

| Chain | Blocks/run | Runs needed | Time at 1 run/min |
|---|---|---|---|
| Sonic | 5,000 | ⌈16,000 / 5,000⌉ = **4 runs** | ~4 minutes |
| Avalanche | 2,000 | ⌈16,000 / 2,000⌉ = **8 runs** | ~8 minutes |

---

## CORS

The `FRONTEND_ORIGIN` var controls which origin may call the API.
Wildcards are **never** allowed — the middleware returns `403` for any origin not
matching `FRONTEND_ORIGIN` exactly.

---

## Known Limits

- **Sonic & Avalanche Fuji only** — no other chains are indexed.
- **Wallets are pseudonymous** — the leaderboard shows truncated addresses; no PII is stored.
- **Public RPCs are rate-limited** — if you hit 429s during backfill, switch to a dedicated
  RPC endpoint and update `SONIC_RPC_URL` / `AVALANCHE_RPC_URL` in `wrangler.toml`.
- **Free plan** — 50 subrequests/execution, 100,000 requests/day, 10 ms CPU time (not wall time).
  Upgrade to Workers Paid for higher limits if the cron takes longer than the free budget.
