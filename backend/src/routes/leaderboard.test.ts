import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  leaderboardRouter,
  statsRouter,
  clearLeaderboardCache,
} from './leaderboard';
import type { ChainEventInput } from '../stats/leaderboard';

function createMockDb(events: ChainEventInput[]) {
  return {
    prepare: (query: string) => ({
      bind: (...args: any[]) => ({
        all: async () => {
          const chain = args[0];
          const filtered = events.filter((e) => !chain || e.chain === chain);
          return { results: filtered };
        },
      }),
    }),
  } as unknown as D1Database;
}

function createTestApp(db?: D1Database) {
  const app = new Hono<{ Bindings: { DB?: D1Database } }>();
  app.use('*', async (c, next) => {
    (c.env as any) = { DB: db };
    await next();
  });
  app.route('/leaderboard', leaderboardRouter);
  app.route('/stats', statsRouter);
  return app;
}

describe('Leaderboard and Stats Routes', () => {
  beforeEach(() => {
    clearLeaderboardCache();
  });

  // ── 1. Unknown chain rejection ──────────────────────────────
  describe('Unknown Chain Handling', () => {
    it('rejects GET /leaderboard with unknown chain with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/leaderboard?chain=solana');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Invalid or missing chain parameter');
      expect(body.error).toContain('sonic, avalanche, stellar');
    });

    it('rejects GET /leaderboard with missing chain parameter with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/leaderboard');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Invalid or missing chain parameter');
    });

    it('rejects GET /stats/:wallet with unknown chain with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/stats/0x1111111111111111111111111111111111111111?chain=bitcoin');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Invalid or missing chain parameter');
    });
  });

  // ── 2. Invalid address format ───────────────────────────────
  describe('Address Validation', () => {
    it('rejects invalid EVM address for sonic with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/stats/not-an-address?chain=sonic');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Invalid wallet address format');
    });

    it('rejects invalid EVM address for avalanche with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/stats/0x123?chain=avalanche');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Invalid wallet address format');
    });

    it('rejects non-Stellar public key for stellar chain with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/stats/0x1111111111111111111111111111111111111111?chain=stellar');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Invalid wallet address format');
    });
  });

  // ── 3. Empty leaderboard ────────────────────────────────────
  describe('Empty Leaderboard Handling', () => {
    it('returns empty rows array and total=0 when no events exist in DB', async () => {
      const app = createTestApp(createMockDb([]));
      const res = await app.request('/leaderboard?chain=sonic');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.chain).toBe('sonic');
      expect(body.total).toBe(0);
      expect(body.rows).toEqual([]);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
      expect(body.window).toBeNull();
    });

    it('returns stats with rank=null and markets_needed=5 for unparticipated wallet', async () => {
      const app = createTestApp(createMockDb([]));
      const res = await app.request('/stats/0x1111111111111111111111111111111111111111?chain=sonic');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.wallet).toBe('0x1111111111111111111111111111111111111111');
      expect(body.chain).toBe('sonic');
      expect(body.rank).toBeNull();
      expect(body.markets_needed).toBe(5);
      expect(body.net_profit).toBe('0');
      expect(body.total_stake).toBe('0');
      expect(body.total_payout).toBe('0');
      expect(body.token_decimals).toBe(6);
      expect(body.resolved_markets).toBe(0);
      expect(body.wins).toBe(0);
      expect(body.win_rate).toBe(0);
    });
  });

  // ── 4. Normal response with events & math verification ──────
  describe('Normal Response with Calculated Stats', () => {
    const walletA = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const walletB = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

    // Helper to generate 5 resolved markets won by walletA and lost by walletB
    function make5Markets(): ChainEventInput[] {
      const events: ChainEventInput[] = [];
      const baseTime = 1770000000; // arbitrary timestamp

      for (let i = 1; i <= 5; i++) {
        const mId = String(i);
        events.push(
          {
            chain: 'sonic',
            txHash: `0xtx_create_${i}`,
            logIndex: 0,
            blockNumber: 100 + i,
            blockTime: baseTime + i * 100,
            eventName: 'MarketCreated',
            marketId: mId,
          },
          {
            chain: 'sonic',
            txHash: `0xtx_buy_a_${i}`,
            logIndex: 1,
            blockNumber: 100 + i,
            blockTime: baseTime + i * 100 + 10,
            eventName: 'SharesBought',
            marketId: mId,
            wallet: walletA,
            outcomeIndex: '0',
            amount: '10000000', // 10 USDC stake on YES
          },
          {
            chain: 'sonic',
            txHash: `0xtx_buy_b_${i}`,
            logIndex: 2,
            blockNumber: 100 + i,
            blockTime: baseTime + i * 100 + 20,
            eventName: 'SharesBought',
            marketId: mId,
            wallet: walletB,
            outcomeIndex: '1',
            amount: '10000000', // 10 USDC stake on NO
          },
          {
            chain: 'sonic',
            txHash: `0xtx_res_${i}`,
            logIndex: 3,
            blockNumber: 100 + i,
            blockTime: baseTime + i * 100 + 50,
            eventName: 'MarketResolved',
            marketId: mId,
            outcomeIndex: '0', // YES won: pool = 20 USDC, A payout = 20 USDC
          }
        );
      }
      return events;
    }

    it('returns ranked rows with strings for base units, rank, win_rate, and correct decimals', async () => {
      const app = createTestApp(createMockDb(make5Markets()));
      const res = await app.request('/leaderboard?chain=sonic');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;

      expect(body.chain).toBe('sonic');
      expect(body.total).toBe(2);
      expect(body.rows.length).toBe(2);

      // Rank 1: walletA (5 wins out of 5, net profit = +50 USDC = 50_000_000)
      const first = body.rows[0];
      expect(first.rank).toBe(1);
      expect(first.wallet).toBe(walletA.toLowerCase());
      expect(typeof first.net_profit).toBe('string');
      expect(first.net_profit).toBe('50000000');
      expect(first.token_decimals).toBe(6);
      expect(first.resolved_markets).toBe(5);
      expect(first.wins).toBe(5);
      expect(first.win_rate).toBe(1);

      // Rank 2: walletB (0 wins out of 5, net profit = -50 USDC = -50_000_000)
      const second = body.rows[1];
      expect(second.rank).toBe(2);
      expect(second.wallet).toBe(walletB.toLowerCase());
      expect(typeof second.net_profit).toBe('string');
      expect(second.net_profit).toBe('-50000000');
      expect(second.token_decimals).toBe(6);
      expect(second.resolved_markets).toBe(5);
      expect(second.wins).toBe(0);
      expect(second.win_rate).toBe(0);
    });

    it('returns wallet stats for ranked wallet (rank=1, markets_needed=0)', async () => {
      const app = createTestApp(createMockDb(make5Markets()));
      const res = await app.request(`/stats/${walletA}?chain=sonic`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;

      expect(body.wallet).toBe(walletA);
      expect(body.rank).toBe(1);
      expect(body.markets_needed).toBe(0);
      expect(typeof body.net_profit).toBe('string');
      expect(body.net_profit).toBe('50000000');
      expect(typeof body.total_stake).toBe('string');
      expect(body.total_stake).toBe('50000000');
      expect(typeof body.total_payout).toBe('string');
      expect(body.total_payout).toBe('100000000');
      expect(body.token_decimals).toBe(6);
      expect(body.resolved_markets).toBe(5);
      expect(body.wins).toBe(5);
      expect(body.win_rate).toBe(1);
    });

    it('returns rank=null and accurate markets_needed when wallet has fewer than 5 resolved markets', async () => {
      // Only 2 markets
      const events = make5Markets().slice(0, 8); // 2 markets * 4 events = 8 events
      const app = createTestApp(createMockDb(events));

      // Leaderboard should have total=0 because minimum threshold is 5
      const lbRes = await app.request('/leaderboard?chain=sonic');
      const lbBody = (await lbRes.json()) as any;
      expect(lbBody.total).toBe(0);

      // Wallet stats should still return totals, with rank=null and markets_needed=3
      const statsRes = await app.request(`/stats/${walletA}?chain=sonic`);
      expect(statsRes.status).toBe(200);
      const statsBody = (await statsRes.json()) as any;
      expect(statsBody.rank).toBeNull();
      expect(statsBody.markets_needed).toBe(3); // 5 - 2 = 3
      expect(statsBody.resolved_markets).toBe(2);
      expect(statsBody.wins).toBe(2);
      expect(statsBody.win_rate).toBe(1);
      expect(statsBody.net_profit).toBe('20000000');
      expect(statsBody.total_stake).toBe('20000000');
      expect(statsBody.total_payout).toBe('40000000');
    });
  });

  // ── 5. Pagination and limits ────────────────────────────────
  describe('Pagination Validation and Slicing', () => {
    function makeManyMarkets(count: number): ChainEventInput[] {
      const events: ChainEventInput[] = [];
      const baseTime = 1770000000;
      for (let i = 1; i <= count; i++) {
        const mId = String(i);
        const wallet = `0x${String(i).padStart(40, '0')}`;
        // Create 5 resolved markets for each wallet so each wallet has resolved_markets = 5
        for (let sub = 1; sub <= 5; sub++) {
          const subId = `${i}_${sub}`;
          events.push(
            {
              chain: 'avalanche',
              txHash: `0xtx_c_${subId}`,
              logIndex: 0,
              blockNumber: 100 + i,
              blockTime: baseTime + i * 10,
              eventName: 'MarketCreated',
              marketId: subId,
            },
            {
              chain: 'avalanche',
              txHash: `0xtx_b_${subId}`,
              logIndex: 1,
              blockNumber: 100 + i,
              blockTime: baseTime + i * 10 + 1,
              eventName: 'SharesBought',
              marketId: subId,
              wallet,
              outcomeIndex: '0',
              amount: String(1000n * BigInt(i)),
            },
            {
              chain: 'avalanche',
              txHash: `0xtx_r_${subId}`,
              logIndex: 2,
              blockNumber: 100 + i,
              blockTime: baseTime + i * 10 + 2,
              eventName: 'MarketResolved',
              marketId: subId,
              outcomeIndex: '0',
            }
          );
        }
      }
      return events;
    }

    it('slices rows with limit and offset', async () => {
      const app = createTestApp(createMockDb(makeManyMarkets(5)));
      // Request limit=2, offset=0
      const page1 = await app.request('/leaderboard?chain=avalanche&limit=2&offset=0');
      expect(page1.status).toBe(200);
      const body1 = (await page1.json()) as any;
      expect(body1.total).toBe(5);
      expect(body1.rows.length).toBe(2);
      expect(body1.rows[0].rank).toBe(1);
      expect(body1.rows[1].rank).toBe(2);

      // Request limit=2, offset=2
      const page2 = await app.request('/leaderboard?chain=avalanche&limit=2&offset=2');
      expect(page2.status).toBe(200);
      const body2 = (await page2.json()) as any;
      expect(body2.total).toBe(5);
      expect(body2.rows.length).toBe(2);
      expect(body2.rows[0].rank).toBe(3);
      expect(body2.rows[1].rank).toBe(4);
    });

    it('rejects limit > 100 with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/leaderboard?chain=sonic&limit=101');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Limit must be an integer between 1 and 100');
    });

    it('rejects limit <= 0 with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/leaderboard?chain=sonic&limit=0');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Limit must be an integer between 1 and 100');
    });

    it('rejects negative offset with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/leaderboard?chain=sonic&offset=-5');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Offset must be a non-negative integer');
    });
  });

  // ── 6. Season and window handling ───────────────────────────
  describe('Season Filter and Window Calculation', () => {
    it('rejects invalid season format with 400', async () => {
      const app = createTestApp();
      const res = await app.request('/leaderboard?chain=sonic&season=invalid-season');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Invalid season parameter');
    });

    it('accepts season=current and includes window start and end ISO strings', async () => {
      const app = createTestApp(createMockDb([]));
      const res = await app.request('/leaderboard?chain=sonic&season=current');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.season).toBe('current');
      expect(body.window).not.toBeNull();
      expect(typeof body.window.start).toBe('string');
      expect(typeof body.window.end).toBe('string');
      expect(new Date(body.window.start).toISOString()).toBe(body.window.start);
      expect(new Date(body.window.end).toISOString()).toBe(body.window.end);
    });

    it('accepts specific ISO week season (e.g. 2026-W43) and returns correct week window', async () => {
      const app = createTestApp(createMockDb([]));
      const res = await app.request('/leaderboard?chain=sonic&season=2026-W43');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.season).toBe('2026-W43');
      expect(body.window).toEqual({
        start: '2026-10-19T00:00:00.000Z',
        end: '2026-10-25T23:59:59.999Z',
      });
    });
  });

  // ── 7. 60-second in-memory caching ──────────────────────────
  describe('In-memory Caching', () => {
    it('sets Cache-Control header and caches consecutive calls', async () => {
      let callCount = 0;
      const db = {
        prepare: () => ({
          bind: () => ({
            all: async () => {
              callCount++;
              return { results: [] };
            },
          }),
        }),
      } as unknown as D1Database;

      const app = createTestApp(db);

      const res1 = await app.request('/leaderboard?chain=sonic');
      expect(res1.status).toBe(200);
      expect(res1.headers.get('Cache-Control')).toBe('public, max-age=60');
      expect(callCount).toBe(1);

      // Second identical call should hit the cache and not query DB again
      const res2 = await app.request('/leaderboard?chain=sonic');
      expect(res2.status).toBe(200);
      expect(res2.headers.get('Cache-Control')).toBe('public, max-age=60');
      expect(callCount).toBe(1);
    });
  });
});
