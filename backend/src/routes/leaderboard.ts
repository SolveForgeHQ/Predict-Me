import { Hono } from 'hono';
import {
  computeLeaderboard,
  computeWalletStats,
  getSeasonWeekId,
  getSeasonWindow,
  MIN_RESOLVED_MARKETS,
  CHAIN_TOKEN_DECIMALS,
  type ChainEventInput,
  type SeasonWindow,
} from '../stats/leaderboard';

interface EnvBindings {
  DB?: D1Database;
}

export const SUPPORTED_CHAINS = ['sonic', 'avalanche', 'stellar'] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export function isSupportedChain(chain: unknown): chain is SupportedChain {
  return typeof chain === 'string' && SUPPORTED_CHAINS.includes(chain as SupportedChain);
}

export function isValidWalletAddress(chain: string, address: string): boolean {
  if (chain === 'sonic' || chain === 'avalanche') {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  if (chain === 'stellar') {
    return /^G[A-Z0-9]{55}$/.test(address);
  }
  return false;
}

// ── In-memory 60s cache ──────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const leaderboardCache = new Map<string, CacheEntry<any>>();
const statsCache = new Map<string, CacheEntry<any>>();

export function clearLeaderboardCache() {
  leaderboardCache.clear();
  statsCache.clear();
}

/**
 * Helper to fetch events for a chain from D1
 */
async function fetchChainEvents(db: D1Database | undefined, chain: string): Promise<ChainEventInput[]> {
  if (!db) return [];
  try {
    const result = await db
      .prepare(
        `SELECT chain, tx_hash as txHash, log_index as logIndex, block_number as blockNumber, block_time as blockTime, event_name as eventName, market_id as marketId, wallet, outcome_index as outcomeIndex, amount
         FROM chain_events
         WHERE chain = ?
         ORDER BY block_number ASC, log_index ASC`
      )
      .bind(chain)
      .all<ChainEventInput>();
    return result.results ?? [];
  } catch (err) {
    console.error(`Failed to fetch chain_events for ${chain}:`, err);
    return [];
  }
}

// ── GET /leaderboard ─────────────────────────────────────────
export const leaderboardRouter = new Hono<{ Bindings: EnvBindings }>();

leaderboardRouter.get('/', async (c) => {
  const chainParam = c.req.query('chain')?.toLowerCase();
  if (!isSupportedChain(chainParam)) {
    return c.json(
      {
        error: `Invalid or missing chain parameter. Supported chains: ${SUPPORTED_CHAINS.join(', ')}`,
      },
      400
    );
  }
  const chain = chainParam;

  // Validate season: 'all' | 'current' | '<YYYY-Www>'
  const seasonParam = c.req.query('season') ?? 'all';
  let resolvedSeason = seasonParam;
  let seasonWindow: SeasonWindow | null = null;

  if (seasonParam === 'current') {
    resolvedSeason = getSeasonWeekId(Math.floor(Date.now() / 1000));
    seasonWindow = getSeasonWindow(resolvedSeason);
  } else if (seasonParam !== 'all') {
    const match = seasonParam.match(/^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/);
    if (!match) {
      return c.json(
        { error: 'Invalid season parameter. Must be "all", "current", or an ISO week like "YYYY-Www"' },
        400
      );
    }
    seasonWindow = getSeasonWindow(seasonParam);
    if (!seasonWindow) {
      return c.json({ error: 'Invalid season week format or out of bounds' }, 400);
    }
  }

  // Validate pagination
  const limitParam = c.req.query('limit');
  let limit = 50;
  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return c.json({ error: 'Limit must be an integer between 1 and 100' }, 400);
    }
    limit = parsed;
  }

  const offsetParam = c.req.query('offset');
  let offset = 0;
  if (offsetParam !== undefined) {
    const parsed = Number(offsetParam);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return c.json({ error: 'Offset must be a non-negative integer' }, 400);
    }
    offset = parsed;
  }

  // Configurable minimum resolved markets (defaults to MIN_RESOLVED_MARKETS = 5)
  const minMarketsParam = c.req.query('min_resolved_markets') ?? c.req.query('min_markets');
  let minResolvedMarkets = MIN_RESOLVED_MARKETS;
  if (minMarketsParam !== undefined) {
    const parsed = Number(minMarketsParam);
    if (Number.isInteger(parsed) && parsed >= 0) {
      minResolvedMarkets = parsed;
    }
  }

  // Check 60-second in-memory cache
  const cacheKey = `${chain}:${resolvedSeason}:${minResolvedMarkets}:${limit}:${offset}`;
  const now = Date.now();
  const cached = leaderboardCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(cached.data);
  }

  // Fetch chain events and compute leaderboard
  const events = await fetchChainEvents(c.env?.DB, chain);
  const fullLeaderboard = computeLeaderboard(events, {
    season: resolvedSeason,
    minResolvedMarkets,
  });

  const total = fullLeaderboard.length;
  const pagedRows = fullLeaderboard.slice(offset, offset + limit);
  const tokenDecimals = CHAIN_TOKEN_DECIMALS[chain] ?? 18;

  const responseBody = {
    chain,
    season: seasonParam,
    window: seasonWindow ? { start: seasonWindow.start, end: seasonWindow.end } : null,
    total,
    limit,
    offset,
    rows: pagedRows.map((entry) => ({
      rank: entry.rank,
      wallet: entry.wallet,
      net_profit: entry.netProfit.toString(),
      token_decimals: tokenDecimals,
      resolved_markets: entry.resolvedMarketsCount,
      wins: entry.wins,
      win_rate: entry.winRate,
    })),
  };

  // Cache response for 60 seconds
  leaderboardCache.set(cacheKey, { data: responseBody, expiresAt: now + CACHE_TTL_MS });
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(responseBody);
});

// ── GET /stats/:wallet ───────────────────────────────────────
export const statsRouter = new Hono<{ Bindings: EnvBindings }>();

statsRouter.get('/:wallet', async (c) => {
  const chainParam = c.req.query('chain')?.toLowerCase();
  if (!isSupportedChain(chainParam)) {
    return c.json(
      {
        error: `Invalid or missing chain parameter. Supported chains: ${SUPPORTED_CHAINS.join(', ')}`,
      },
      400
    );
  }
  const chain = chainParam;

  const walletParam = c.req.param('wallet');
  if (!isValidWalletAddress(chain, walletParam)) {
    return c.json(
      {
        error: `Invalid wallet address format for chain "${chain}"`,
      },
      400
    );
  }

  // Validate season: 'all' | 'current' | '<YYYY-Www>' (default 'all')
  const seasonParam = c.req.query('season') ?? 'all';
  let resolvedSeason = seasonParam;
  let seasonWindow: SeasonWindow | null = null;

  if (seasonParam === 'current') {
    resolvedSeason = getSeasonWeekId(Math.floor(Date.now() / 1000));
    seasonWindow = getSeasonWindow(resolvedSeason);
  } else if (seasonParam !== 'all') {
    const match = seasonParam.match(/^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/);
    if (!match) {
      return c.json(
        { error: 'Invalid season parameter. Must be "all", "current", or an ISO week like "YYYY-Www"' },
        400
      );
    }
    seasonWindow = getSeasonWindow(seasonParam);
    if (!seasonWindow) {
      return c.json({ error: 'Invalid season week format or out of bounds' }, 400);
    }
  }

  // Configurable minimum resolved markets (defaults to MIN_RESOLVED_MARKETS = 5)
  const minMarketsParam = c.req.query('min_resolved_markets') ?? c.req.query('min_markets');
  let minResolvedMarkets = MIN_RESOLVED_MARKETS;
  if (minMarketsParam !== undefined) {
    const parsed = Number(minMarketsParam);
    if (Number.isInteger(parsed) && parsed >= 0) {
      minResolvedMarkets = parsed;
    }
  }

  // Check 60-second in-memory cache
  const normalizedWallet = walletParam.toLowerCase();
  const cacheKey = `${chain}:${resolvedSeason}:${minResolvedMarkets}:${normalizedWallet}`;
  const now = Date.now();
  const cached = statsCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(cached.data);
  }

  // Fetch chain events and compute wallet stats
  const events = await fetchChainEvents(c.env?.DB, chain);
  const stats = computeWalletStats(events, walletParam, {
    season: resolvedSeason,
    minResolvedMarkets,
  });
  const tokenDecimals = CHAIN_TOKEN_DECIMALS[chain] ?? 18;

  const responseBody = {
    wallet: walletParam,
    chain,
    season: seasonParam,
    window: seasonWindow ? { start: seasonWindow.start, end: seasonWindow.end } : null,
    rank: stats.rank,
    markets_needed: stats.marketsNeeded,
    net_profit: stats.netProfit.toString(),
    total_stake: stats.totalStake.toString(),
    total_payout: stats.totalPayout.toString(),
    token_decimals: tokenDecimals,
    resolved_markets: stats.resolvedMarketsCount,
    wins: stats.wins,
    win_rate: stats.winRate,
  };

  // Cache response for 60 seconds
  statsCache.set(cacheKey, { data: responseBody, expiresAt: now + CACHE_TTL_MS });
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(responseBody);
});

export default leaderboardRouter;
