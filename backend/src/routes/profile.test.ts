import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { profileRouter, clearProfileCache } from './profile';
import type { ChainEventInput } from '../stats/leaderboard';

// ── Helpers ──────────────────────────────────────────────────────────────────

const WALLET_WINNER  = '0xaabbccddee0000000000000000000000aaaabbbb';
const WALLET_LOSER   = '0xaabbccddee0000000000000000000000ccccdddd';
const WALLET_UNKNOWN = '0xffffffffffffffffffffffffffffffffffffffff';
const CHAIN = 'avalanche';

function makeEvent(overrides: Partial<ChainEventInput>): ChainEventInput {
  return {
    chain: CHAIN,
    txHash: '0xdeadbeef',
    logIndex: 0,
    blockNumber: 100,
    blockTime: 1_700_000_000,
    eventName: 'SharesBought',
    marketId: '1',
    wallet: null,
    outcomeIndex: null,
    amount: null,
    ...overrides,
  };
}

function createMockDb(events: ChainEventInput[], markets: Record<string, unknown>[] = []) {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => {
          if (sql.includes('chain_events')) {
            const chain = args[0] as string;
            return { results: events.filter((e) => e.chain === chain) };
          }
          if (sql.includes('market_cache')) {
            const chain = args[0] as string;
            return { results: markets.filter((m: any) => m.chain === chain) };
          }
          return { results: [] };
        },
      }),
    }),
  } as unknown as D1Database;
}

function createApp(db?: D1Database) {
  const app = new Hono<{ Bindings: { DB?: D1Database } }>();
  app.use('*', async (c, next) => { (c.env as any) = { DB: db }; await next(); });
  app.route('/profile', profileRouter);
  return app;
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

function buildMarket1Events(): ChainEventInput[] {
  return [
    // Market 1: resolved YES (winner), winner bought YES, loser bought NO
    makeEvent({ eventName: 'MarketCreated', marketId: '1', wallet: null }),
    makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: WALLET_WINNER, outcomeIndex: '0', amount: '50000000000000000', txHash: '0xbuy1' }),
    makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: WALLET_LOSER,  outcomeIndex: '1', amount: '30000000000000000', txHash: '0xbuy2' }),
    makeEvent({ eventName: 'MarketResolved', marketId: '1', wallet: null, outcomeIndex: '0', blockTime: 1_700_100_000 }),
    makeEvent({ eventName: 'WinningsClaimed', marketId: '1', wallet: WALLET_WINNER, txHash: '0xclaim1' }),
  ];
}

function buildMarket2Events(): ChainEventInput[] {
  return [
    // Market 2: cancelled — neither wallet's stake should count in totals
    makeEvent({ eventName: 'MarketCreated', marketId: '2', wallet: null }),
    makeEvent({ eventName: 'SharesBought', marketId: '2', wallet: WALLET_WINNER, outcomeIndex: '0', amount: '10000000000000000', txHash: '0xbuy3' }),
    makeEvent({ eventName: 'MarketCancelled', marketId: '2', wallet: null }),
    makeEvent({ eventName: 'Refunded', marketId: '2', wallet: WALLET_WINNER, txHash: '0xref1' }),
  ];
}

function buildMarket3Events(): ChainEventInput[] {
  return [
    // Market 3: open (no resolved event yet)
    makeEvent({ eventName: 'MarketCreated', marketId: '3', wallet: null }),
    makeEvent({ eventName: 'SharesBought', marketId: '3', wallet: WALLET_WINNER, outcomeIndex: '0', amount: '20000000000000000', txHash: '0xbuy4' }),
  ];
}

const MOCK_MARKETS = [
  { chain: CHAIN, market_id: '1', question: 'Will AVAX reach $50?', outcomes: '["YES","NO"]', status: 'resolved', resolved_outcome_index: 0 },
  { chain: CHAIN, market_id: '2', question: 'Will it rain?',        outcomes: '["YES","NO"]', status: 'cancelled', resolved_outcome_index: null },
  { chain: CHAIN, market_id: '3', question: 'Open market test',     outcomes: '["YES","NO"]', status: 'open',     resolved_outcome_index: null },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /profile/:wallet', () => {
  beforeEach(() => { clearProfileCache(); });

  it('rejects an unknown chain with 400', async () => {
    const app = createApp();
    const res = await app.request(`/profile/${WALLET_WINNER}?chain=ethereum`);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('chain');
  });

  it('rejects an invalid wallet address with 400', async () => {
    const app = createApp();
    const res = await app.request(`/profile/not-a-wallet?chain=${CHAIN}`);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('wallet');
  });

  it('returns empty profile for unknown wallet (no events)', async () => {
    const db = createMockDb([...buildMarket1Events(), ...buildMarket2Events(), ...buildMarket3Events()], MOCK_MARKETS);
    const app = createApp(db);
    const res = await app.request(`/profile/${WALLET_UNKNOWN}?chain=${CHAIN}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.totals.resolved_markets).toBe(0);
    expect(body.totals.wins).toBe(0);
    expect(body.totals.net_profit).toBe('0');
    expect(body.history).toHaveLength(0);
    expect(body.open_positions).toHaveLength(0);
  });

  it('returns correct stats for a winner', async () => {
    const db = createMockDb(buildMarket1Events(), MOCK_MARKETS);
    const app = createApp(db);
    const res = await app.request(`/profile/${WALLET_WINNER}?chain=${CHAIN}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    // Winner staked 50e15 on YES, loser staked 30e15 on NO
    // totalPool = 80e15, winningPool = 50e15
    // payout = (50e15 * 80e15) / 50e15 = 80e15
    // profit = 80e15 - 50e15 = 30e15
    expect(body.totals.resolved_markets).toBe(1);
    expect(body.totals.wins).toBe(1);
    expect(BigInt(body.totals.net_profit)).toBe(BigInt('30000000000000000'));
    expect(body.history).toHaveLength(1);
    expect(body.history[0].status).toBe('won');
    expect(body.history[0].question).toBe('Will AVAX reach $50?');
    expect(body.history[0].outcome_backed).toContain('YES');
    expect(BigInt(body.history[0].payout)).toBe(BigInt('80000000000000000'));
  });

  it('returns correct stats for a loser', async () => {
    const db = createMockDb(buildMarket1Events(), MOCK_MARKETS);
    const app = createApp(db);
    const res = await app.request(`/profile/${WALLET_LOSER}?chain=${CHAIN}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.totals.resolved_markets).toBe(1);
    expect(body.totals.wins).toBe(0);
    // Loser staked 30e15, payout = 0 (bet on NO, YES won)
    expect(BigInt(body.totals.net_profit)).toBe(BigInt('-30000000000000000'));
    expect(body.history[0].status).toBe('lost');
    expect(BigInt(body.history[0].payout)).toBe(0n);
  });

  it('cancelled market appears in history as cancelled_refunded but does NOT count in totals', async () => {
    const db = createMockDb([...buildMarket1Events(), ...buildMarket2Events()], MOCK_MARKETS);
    const app = createApp(db);
    const res = await app.request(`/profile/${WALLET_WINNER}?chain=${CHAIN}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    // resolved_markets should only count market 1 (resolved), not market 2 (cancelled)
    expect(body.totals.resolved_markets).toBe(1);
    const cancelled = body.history.find((h: any) => h.status === 'cancelled_refunded');
    expect(cancelled).toBeDefined();
    expect(cancelled.question).toBe('Will it rain?');
  });

  it('open position appears in open_positions, not history', async () => {
    const db = createMockDb([...buildMarket1Events(), ...buildMarket3Events()], MOCK_MARKETS);
    const app = createApp(db);
    const res = await app.request(`/profile/${WALLET_WINNER}?chain=${CHAIN}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.open_positions).toHaveLength(1);
    expect(body.open_positions[0].question).toBe('Open market test');
    expect(body.open_positions[0].outcome_backed).toContain('YES');
    // open positions do NOT appear in history
    const openInHistory = body.history.find((h: any) => h.market_id === '3');
    expect(openInHistory).toBeUndefined();
  });

  it('pagination works', async () => {
    const db = createMockDb([...buildMarket1Events(), ...buildMarket2Events()], MOCK_MARKETS);
    const app = createApp(db);
    const res = await app.request(`/profile/${WALLET_WINNER}?chain=${CHAIN}&limit=1&offset=0`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.history.length).toBeLessThanOrEqual(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.offset).toBe(0);
  });

  it('token_decimals is 18 for Avalanche', async () => {
    const db = createMockDb([], []);
    const app = createApp(db);
    const res = await app.request(`/profile/${WALLET_UNKNOWN}?chain=${CHAIN}`);
    const body = await res.json() as any;
    expect(body.token_decimals).toBe(18);
  });
});
