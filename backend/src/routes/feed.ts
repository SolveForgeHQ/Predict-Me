/**
 * routes/feed.ts
 *
 * GET /feed?chain=sonic|avalanche&limit=30&cursor=<blockNumber:logIndex>&market_id=<optional>
 *
 * Returns on-chain events newest-first from chain_events + market_cache.
 * Cursor pagination: cursor encodes (blockNumber:logIndex) of the OLDEST item
 * the client already has, so ?cursor=59916000:2 means "give me everything
 * older than block 59916000, log 2".
 *
 * Response:
 * {
 *   chain, items: FeedItem[], next_cursor: string|null, has_more: boolean
 * }
 *
 * FeedItem: {
 *   type, wallet, market_id, question, outcome_label, amount,
 *   token_decimals, timestamp, tx_hash, cursor
 * }
 */

import { Hono } from 'hono';
import { CHAIN_TOKEN_DECIMALS } from '../stats/leaderboard';
import { isSupportedChain } from './leaderboard';

interface EnvBindings {
  DB?: D1Database;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type FeedEventType =
  | 'MarketCreated'
  | 'SharesBought'
  | 'MarketResolved'
  | 'MarketCancelled'
  | 'WinningsClaimed'
  | 'Refunded';

const FEED_EVENT_TYPES = new Set<string>([
  'MarketCreated', 'SharesBought', 'MarketResolved',
  'MarketCancelled', 'WinningsClaimed', 'Refunded',
]);

export interface FeedItem {
  type:           FeedEventType;
  wallet:         string | null;
  market_id:      string;
  question:       string;
  outcome_label:  string | null;
  amount:         string | null;   // base units as string, null when not applicable
  token_decimals: number;
  timestamp:      number;          // Unix seconds
  tx_hash:        string;
  /** Opaque cursor = "<block_number>:<log_index>" for this item */
  cursor:         string;
}

interface RawEvent {
  chain:       string;
  tx_hash:     string;
  log_index:   number;
  block_number: number;
  block_time:  number;
  event_name:  string;
  market_id:   string;
  wallet:      string | null;
  outcome_index: string | null;
  amount:      string | null;
}

interface MarketRow {
  market_id:  string;
  question:   string;
  outcomes:   string;
}

// ── Cache ────────────────────────────────────────────────────────────────────

const feedCache = new Map<string, { data: unknown; expiresAt: number }>();
const FEED_CACHE_TTL_MS = 10_000; // 10 seconds

export function clearFeedCache() {
  feedCache.clear();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseCursor(cursor: string): { blockNumber: number; logIndex: number } | null {
  const parts = cursor.split(':');
  if (parts.length !== 2) return null;
  const blockNumber = Number(parts[0]);
  const logIndex    = Number(parts[1]);
  if (!Number.isFinite(blockNumber) || !Number.isFinite(logIndex)) return null;
  return { blockNumber, logIndex };
}

function makeCursor(blockNumber: number, logIndex: number): string {
  return `${blockNumber}:${logIndex}`;
}

function getOutcomeLabel(
  outcomeIndex: string | null,
  outcomesJson: string
): string | null {
  if (outcomeIndex === null || outcomeIndex === undefined) return null;
  try {
    const arr = JSON.parse(outcomesJson) as string[];
    const idx = Number(outcomeIndex);
    return arr[idx] ?? `Outcome ${idx}`;
  } catch {
    return `Outcome ${outcomeIndex}`;
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export const feedRouter = new Hono<{ Bindings: EnvBindings }>();

feedRouter.get('/', async (c) => {
  // ── Validate chain ─────────────────────────────────────────────────────────
  const chainParam = c.req.query('chain')?.toLowerCase();
  if (!isSupportedChain(chainParam)) {
    return c.json(
      { error: `Invalid or missing chain parameter. Supported: sonic, avalanche, stellar` },
      400,
    );
  }
  const chain = chainParam;

  // ── Validate limit ─────────────────────────────────────────────────────────
  const limitParam = c.req.query('limit');
  let limit = 30;
  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      return c.json({ error: 'limit must be an integer between 1 and 50' }, 400);
    }
    limit = parsed;
  }

  // ── Validate cursor ────────────────────────────────────────────────────────
  const cursorParam = c.req.query('cursor');
  let cursorParsed: { blockNumber: number; logIndex: number } | null = null;
  if (cursorParam) {
    cursorParsed = parseCursor(cursorParam);
    if (!cursorParsed) {
      return c.json({ error: 'Invalid cursor format. Expected "<blockNumber>:<logIndex>"' }, 400);
    }
  }

  // ── Validate market_id (optional filter) ───────────────────────────────────
  const marketIdParam = c.req.query('market_id');
  if (marketIdParam !== undefined && !/^\d+$/.test(marketIdParam)) {
    return c.json({ error: 'market_id must be a positive integer string' }, 400);
  }

  // ── Cache ──────────────────────────────────────────────────────────────────
  const cacheKey = `${chain}:${limit}:${cursorParam ?? ''}:${marketIdParam ?? ''}`;
  const now = Date.now();
  const cached = feedCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    c.header('Cache-Control', 'public, max-age=10');
    return c.json(cached.data);
  }

  if (!c.env?.DB) {
    return c.json({ chain, items: [], next_cursor: null, has_more: false });
  }

  const db = c.env.DB as D1Database;

  // ── Fetch events from D1 (newest first, cursor-paginated) ──────────────────
  // We fetch limit+1 to detect has_more without an extra COUNT query.
  let eventsQuery: string;
  let eventsBindings: (string | number)[];

  const baseWhere = marketIdParam
    ? `WHERE chain = ? AND event_name IN ('MarketCreated','SharesBought','MarketResolved','MarketCancelled','WinningsClaimed','Refunded') AND market_id = ?`
    : `WHERE chain = ? AND event_name IN ('MarketCreated','SharesBought','MarketResolved','MarketCancelled','WinningsClaimed','Refunded')`;

  if (cursorParsed) {
    // "before" cursor: items strictly older than cursor position
    eventsQuery = `
      SELECT chain, tx_hash, log_index, block_number, block_time,
             event_name, market_id, wallet, outcome_index, amount
      FROM chain_events
      ${baseWhere}
      AND (block_number < ? OR (block_number = ? AND log_index < ?))
      ORDER BY block_number DESC, log_index DESC
      LIMIT ?`;
    eventsBindings = marketIdParam
      ? [chain, marketIdParam, cursorParsed.blockNumber, cursorParsed.blockNumber, cursorParsed.logIndex, limit + 1]
      : [chain, cursorParsed.blockNumber, cursorParsed.blockNumber, cursorParsed.logIndex, limit + 1];
  } else {
    eventsQuery = `
      SELECT chain, tx_hash, log_index, block_number, block_time,
             event_name, market_id, wallet, outcome_index, amount
      FROM chain_events
      ${baseWhere}
      ORDER BY block_number DESC, log_index DESC
      LIMIT ?`;
    eventsBindings = marketIdParam
      ? [chain, marketIdParam, limit + 1]
      : [chain, limit + 1];
  }

  let rawEvents: RawEvent[] = [];
  try {
    const stmt = db.prepare(eventsQuery);
    const bound = (stmt as any).bind(...eventsBindings);
    const result = await (bound as any).all();
    rawEvents = (result.results ?? []) as RawEvent[];
  } catch (err) {
    console.error('[feed] Failed to query chain_events:', err);
    return c.json({ chain, items: [], next_cursor: null, has_more: false });
  }

  const hasMore = rawEvents.length > limit;
  if (hasMore) rawEvents.pop(); // remove the sentinel

  // ── Fetch market metadata for all unique market IDs ────────────────────────
  const marketIds = [...new Set(rawEvents.map((e) => e.market_id))];
  const marketMap = new Map<string, MarketRow>();

  if (marketIds.length > 0) {
    try {
      const placeholders = marketIds.map(() => '?').join(',');
      const mResult = await db
        .prepare(
          `SELECT market_id, question, outcomes FROM market_cache WHERE chain = ? AND market_id IN (${placeholders})`
        )
        .bind(chain, ...marketIds)
        .all<MarketRow>();
      for (const row of mResult.results ?? []) {
        marketMap.set(row.market_id, row);
      }
    } catch (err) {
      console.error('[feed] Failed to query market_cache:', err);
      // Non-fatal — questions will fall back to "Market #N"
    }
  }

  // ── Build FeedItems ────────────────────────────────────────────────────────
  const tokenDecimals = CHAIN_TOKEN_DECIMALS[chain] ?? 18;

  const items: FeedItem[] = rawEvents.map((ev) => {
    const marketRow = marketMap.get(ev.market_id);
    const question = marketRow ? marketRow.question : `Market #${ev.market_id}`;
    const outcomesJson = marketRow?.outcomes ?? '["YES","NO"]';

    // Outcome label: relevant for SharesBought, MarketResolved, WinningsClaimed
    let outcomeLabel: string | null = null;
    if (ev.event_name === 'SharesBought' || ev.event_name === 'MarketResolved') {
      outcomeLabel = getOutcomeLabel(ev.outcome_index, outcomesJson);
    }
    // For WinningsClaimed we don't have the outcomeIndex in the event — omit

    return {
      type:           ev.event_name as FeedEventType,
      wallet:         ev.wallet ?? null,
      market_id:      ev.market_id,
      question,
      outcome_label:  outcomeLabel,
      amount:         ev.amount ?? null,
      token_decimals: tokenDecimals,
      timestamp:      ev.block_time,
      tx_hash:        ev.tx_hash,
      cursor:         makeCursor(ev.block_number, ev.log_index),
    };
  });

  // ── Build next_cursor (the cursor of the LAST/oldest item returned) ─────────
  const nextCursor = items.length > 0 ? items[items.length - 1].cursor : null;

  const responseBody = {
    chain,
    items,
    next_cursor: hasMore ? nextCursor : null,
    has_more:    hasMore,
  };

  feedCache.set(cacheKey, { data: responseBody, expiresAt: now + FEED_CACHE_TTL_MS });
  c.header('Cache-Control', 'public, max-age=10');
  return c.json(responseBody);
});

export default feedRouter;
