/**
 * routes/profile.ts
 *
 * GET /profile/:wallet?chain=avalanche|sonic|stellar&limit=20&offset=0
 *
 * Returns a wallet's trading history and performance summary, built from
 * chain_events + market_cache. Stats rules match the leaderboard exactly
 * (cancelled markets excluded, win = payout > stake, BigInt math throughout).
 *
 * Response shape:
 * {
 *   wallet, chain, token_decimals,
 *   totals: { total_staked, total_payout, net_profit, resolved_markets, wins, win_rate, rank },
 *   history: [ { market_id, question, outcomes, outcome_backed, stake, status, payout, profit, tx_hash } ],
 *   open_positions: [ { market_id, question, outcomes, outcome_backed, stake, tx_hash } ],
 *   pagination: { total, limit, offset }
 * }
 */

import { Hono } from 'hono';
import {
  computeWalletStats,
  computeLeaderboard,
  CHAIN_TOKEN_DECIMALS,
  MIN_RESOLVED_MARKETS,
  type ChainEventInput,
} from '../stats/leaderboard';
import { isSupportedChain, isValidWalletAddress } from './leaderboard';

interface EnvBindings {
  DB?: D1Database;
}

// ── In-memory 60-second cache ────────────────────────────────────────────────
const profileCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export function clearProfileCache() {
  profileCache.clear();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchChainEvents(db: D1Database | undefined, chain: string): Promise<ChainEventInput[]> {
  if (!db) return [];
  try {
    const result = await db
      .prepare(
        `SELECT chain, tx_hash as txHash, log_index as logIndex, block_number as blockNumber,
                block_time as blockTime, event_name as eventName, market_id as marketId,
                wallet, outcome_index as outcomeIndex, amount
         FROM chain_events
         WHERE chain = ?
         ORDER BY block_number ASC, log_index ASC`
      )
      .bind(chain)
      .all<ChainEventInput>();
    return result.results ?? [];
  } catch (err) {
    console.error(`[profile] Failed to fetch chain_events for ${chain}:`, err);
    return [];
  }
}

interface MarketMeta {
  question: string;
  outcomes: string[];
  status: string;
  resolvedOutcomeIndex: number | null;
}

async function fetchMarketMeta(db: D1Database | undefined, chain: string): Promise<Map<string, MarketMeta>> {
  if (!db) return new Map();
  try {
    const result = await db
      .prepare(
        `SELECT market_id, question, outcomes, status, resolved_outcome_index
         FROM market_cache
         WHERE chain = ?`
      )
      .bind(chain)
      .all<{ market_id: string; question: string; outcomes: string; status: string; resolved_outcome_index: number | null }>();

    const map = new Map<string, MarketMeta>();
    for (const row of result.results ?? []) {
      let outcomes: string[] = ['YES', 'NO'];
      try {
        const parsed = JSON.parse(row.outcomes);
        if (Array.isArray(parsed)) outcomes = parsed.map(String);
      } catch { /* keep default */ }
      map.set(row.market_id, {
        question: row.question,
        outcomes,
        status: row.status,
        resolvedOutcomeIndex: row.resolved_outcome_index ?? null,
      });
    }
    return map;
  } catch (err) {
    console.error(`[profile] Failed to fetch market_cache for ${chain}:`, err);
    return new Map();
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export const profileRouter = new Hono<{ Bindings: EnvBindings }>();

profileRouter.get('/:wallet', async (c) => {
  // ── 1. Validate chain ──────────────────────────────────────────────────────
  const chainParam = c.req.query('chain')?.toLowerCase();
  if (!isSupportedChain(chainParam)) {
    return c.json(
      { error: `Invalid or missing chain parameter. Supported chains: sonic, avalanche, stellar` },
      400
    );
  }
  const chain = chainParam;

  // ── 2. Validate wallet ─────────────────────────────────────────────────────
  const walletParam = c.req.param('wallet');
  if (!isValidWalletAddress(chain, walletParam)) {
    return c.json(
      { error: `Invalid wallet address format for chain "${chain}"` },
      400
    );
  }
  const normalizedWallet = walletParam.toLowerCase();

  // ── 3. Validate pagination ────────────────────────────────────────────────
  const limitParam = c.req.query('limit');
  let limit = 20;
  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return c.json({ error: 'limit must be an integer between 1 and 100' }, 400);
    }
    limit = parsed;
  }

  const offsetParam = c.req.query('offset');
  let offset = 0;
  if (offsetParam !== undefined) {
    const parsed = Number(offsetParam);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return c.json({ error: 'offset must be a non-negative integer' }, 400);
    }
    offset = parsed;
  }

  // ── 4. Cache check ─────────────────────────────────────────────────────────
  const cacheKey = `${chain}:${normalizedWallet}:${limit}:${offset}`;
  const now = Date.now();
  const cached = profileCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(cached.data);
  }

  // ── 5. Fetch data ──────────────────────────────────────────────────────────
  const [events, marketMeta] = await Promise.all([
    fetchChainEvents(c.env?.DB, chain),
    fetchMarketMeta(c.env?.DB, chain),
  ]);

  const tokenDecimals = CHAIN_TOKEN_DECIMALS[chain] ?? 18;

  // ── 6. Compute totals (reuse existing stats engine) ────────────────────────
  const stats = computeWalletStats(events, walletParam, { season: 'all', minResolvedMarkets: MIN_RESOLVED_MARKETS });

  // ── 7. Build per-market history using the same rules as the stats engine ───
  // Group events by market
  interface MarketBucket {
    isCancelled: boolean;
    isResolved: boolean;
    winningOutcomeIndex: string | null;
    totalPool: bigint;
    winningPool: bigint;
    walletStakeByOutcome: Map<string, bigint>; // outcomeIndex -> stake
    walletTotalStake: bigint;
    walletClaimed: boolean;
    txHashesBought: string[];
    txHashClaimed: string | null;
    blockTime: number;
  }

  const buckets = new Map<string, MarketBucket>();

  for (const ev of events) {
    const key = ev.marketId;
    let b = buckets.get(key);
    if (!b) {
      b = {
        isCancelled: false,
        isResolved: false,
        winningOutcomeIndex: null,
        totalPool: 0n,
        winningPool: 0n,
        walletStakeByOutcome: new Map(),
        walletTotalStake: 0n,
        walletClaimed: false,
        txHashesBought: [],
        txHashClaimed: null,
        blockTime: ev.blockTime,
      };
      buckets.set(key, b);
    }

    if (ev.eventName === 'MarketCancelled') {
      b.isCancelled = true;
    } else if (ev.eventName === 'MarketResolved') {
      b.isResolved = true;
      b.winningOutcomeIndex = ev.outcomeIndex ?? null;
    } else if (ev.eventName === 'SharesBought') {
      const amt = BigInt(ev.amount ?? '0');
      b.totalPool += amt;
      if (ev.outcomeIndex !== null && ev.outcomeIndex !== undefined) {
        const idx = String(ev.outcomeIndex);
        if (b.winningOutcomeIndex !== null && idx === b.winningOutcomeIndex) {
          b.winningPool += amt;
        }
        // Track this wallet's stake
        if (ev.wallet && ev.wallet.toLowerCase() === normalizedWallet) {
          b.walletTotalStake += amt;
          b.walletStakeByOutcome.set(idx, (b.walletStakeByOutcome.get(idx) ?? 0n) + amt);
          b.txHashesBought.push(ev.txHash);
        }
      }
    } else if (ev.eventName === 'WinningsClaimed') {
      if (ev.wallet && ev.wallet.toLowerCase() === normalizedWallet) {
        b.walletClaimed = true;
        b.txHashClaimed = ev.txHash;
      }
    } else if (ev.eventName === 'Refunded') {
      if (ev.wallet && ev.wallet.toLowerCase() === normalizedWallet) {
        b.walletClaimed = true; // reuse claimed flag for refund
        b.txHashClaimed = ev.txHash;
      }
    }
  }

  // Second pass: compute winningPool for each resolved market now that we have all events
  for (const [, b] of buckets) {
    if (b.isResolved && b.winningOutcomeIndex !== null) {
      // Re-compute winningPool from all SharesBought events for this market
      b.winningPool = 0n;
      for (const ev of events) {
        if (ev.marketId === [...buckets.keys()].find(k => buckets.get(k) === b) && ev.eventName === 'SharesBought') {
          const amt = BigInt(ev.amount ?? '0');
          if (String(ev.outcomeIndex) === b.winningOutcomeIndex) {
            b.winningPool += amt;
          }
        }
      }
    }
  }

  // Rebuild pools correctly with a cleaner single pass
  const poolsByMarket = new Map<string, { total: bigint; byOutcome: Map<string, bigint> }>();
  for (const ev of events) {
    if (ev.eventName !== 'SharesBought') continue;
    let p = poolsByMarket.get(ev.marketId);
    if (!p) { p = { total: 0n, byOutcome: new Map() }; poolsByMarket.set(ev.marketId, p); }
    const amt = BigInt(ev.amount ?? '0');
    p.total += amt;
    const idx = String(ev.outcomeIndex ?? '0');
    p.byOutcome.set(idx, (p.byOutcome.get(idx) ?? 0n) + amt);
  }

  // Build history entries — only markets where this wallet participated
  type PositionStatus = 'open' | 'won' | 'lost' | 'cancelled_refunded' | 'resolved_unclaimed';

  interface HistoryEntry {
    market_id: string;
    question: string;
    outcomes: string[];
    outcome_backed: string[];
    stake: string;
    status: PositionStatus;
    payout: string;
    profit: string;
    tx_hash: string;
  }

  interface OpenPosition {
    market_id: string;
    question: string;
    outcomes: string[];
    outcome_backed: string[];
    stake: string;
    tx_hash: string;
  }

  const history: HistoryEntry[] = [];
  const openPositions: OpenPosition[] = [];

  for (const [marketId, b] of buckets) {
    if (b.walletTotalStake === 0n) continue; // wallet didn't participate

    const meta = marketMeta.get(marketId);
    const question = meta?.question ?? `Market #${marketId}`;
    const outcomeLabels = meta?.outcomes ?? ['YES', 'NO'];
    const outcomeBacked = [...b.walletStakeByOutcome.keys()].map(
      (idx) => outcomeLabels[Number(idx)] ?? `Outcome ${idx}`
    );
    const txHash = b.txHashClaimed ?? b.txHashesBought[0] ?? '';

    const pools = poolsByMarket.get(marketId);
    const totalPool = pools?.total ?? 0n;

    if (b.isCancelled) {
      history.push({
        market_id: marketId,
        question,
        outcomes: outcomeLabels,
        outcome_backed: outcomeBacked,
        stake: b.walletTotalStake.toString(),
        status: 'cancelled_refunded',
        payout: '0',
        profit: (-b.walletTotalStake).toString(),
        tx_hash: txHash,
      });
      continue;
    }

    if (!b.isResolved || b.winningOutcomeIndex === null) {
      // Open position
      openPositions.push({
        market_id: marketId,
        question,
        outcomes: outcomeLabels,
        outcome_backed: outcomeBacked,
        stake: b.walletTotalStake.toString(),
        tx_hash: txHash,
      });
      continue;
    }

    // Resolved
    const winningPool = pools?.byOutcome.get(b.winningOutcomeIndex) ?? 0n;
    const walletWinningStake = b.walletStakeByOutcome.get(b.winningOutcomeIndex) ?? 0n;

    let entitledPayout = 0n;
    if (winningPool > 0n && walletWinningStake > 0n) {
      entitledPayout = (walletWinningStake * totalPool) / winningPool;
    }

    const netProfit = entitledPayout - b.walletTotalStake;
    const isWin = entitledPayout > b.walletTotalStake;

    let status: PositionStatus;
    if (isWin && b.walletClaimed) {
      status = 'won';
    } else if (isWin && !b.walletClaimed) {
      status = 'resolved_unclaimed';
    } else {
      status = 'lost';
    }

    history.push({
      market_id: marketId,
      question,
      outcomes: outcomeLabels,
      outcome_backed: outcomeBacked,
      stake: b.walletTotalStake.toString(),
      status,
      payout: entitledPayout.toString(),
      profit: netProfit.toString(),
      tx_hash: txHash,
    });
  }

  // Sort history: newest resolved first (cancelled and open go by market_id desc as proxy)
  const order: Record<PositionStatus, number> = { won: 0, resolved_unclaimed: 1, lost: 2, cancelled_refunded: 3, open: 4 };
  history.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

  // Paginate history
  const totalHistory = history.length;
  const pagedHistory = history.slice(offset, offset + limit);

  // ── 8. Build response ──────────────────────────────────────────────────────
  const responseBody = {
    wallet: walletParam,
    chain,
    token_decimals: tokenDecimals,
    totals: {
      total_staked: stats.totalStake.toString(),
      total_payout: stats.totalPayout.toString(),
      net_profit: stats.netProfit.toString(),
      resolved_markets: stats.resolvedMarketsCount,
      wins: stats.wins,
      win_rate: stats.winRate,
      rank: stats.rank,
    },
    history: pagedHistory,
    open_positions: openPositions,
    pagination: {
      total: totalHistory,
      limit,
      offset,
    },
  };

  // Cache for 60 seconds
  profileCache.set(cacheKey, { data: responseBody, expiresAt: now + CACHE_TTL_MS });
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(responseBody);
});

export default profileRouter;
