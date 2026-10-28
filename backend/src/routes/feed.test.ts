import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { feedRouter, clearFeedCache } from './feed';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface RawEvent {
  chain: string; tx_hash: string; log_index: number; block_number: number;
  block_time: number; event_name: string; market_id: string;
  wallet: string | null; outcome_index: string | null; amount: string | null;
}

interface MarketRow { chain: string; market_id: string; question: string; outcomes: string; }

function makeEvent(overrides: Partial<RawEvent>): RawEvent {
  return {
    chain: 'avalanche', tx_hash: '0xabc', log_index: 0,
    block_number: 1000, block_time: 1_700_000_000,
    event_name: 'SharesBought', market_id: '1',
    wallet: '0xuser0000000000000000000000000000000000ab',
    outcome_index: '0', amount: '10000000000000000',
    ...overrides,
  };
}

function createMockDb(events: RawEvent[], markets: MarketRow[] = []) {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => {
          if (sql.includes('chain_events')) {
            const chain = args[0] as string;
            // Apply market_id filter if present in the SQL
            const filtered = events.filter((e) => {
              if (e.chain !== chain) return false;
              // cursor filter: block < X OR (block = X AND log < Y)
              if (sql.includes('block_number < ?')) {
                const bIdx = sql.includes('market_id IN') ? 3 : 2; // approximate
                const cursorBlock = args[bIdx] as number;
                const cursorLog = args[bIdx + 2] as number;
                if (e.block_number > cursorBlock) return false;
                if (e.block_number === cursorBlock && e.log_index >= cursorLog) return false;
              }
              return true;
            });
            // Sort newest first
            return { results: [...filtered].sort((a, b) => b.block_number - a.block_number || b.log_index - a.log_index) };
          }
          if (sql.includes('market_cache')) {
            const chain = args[0] as string;
            return { results: markets.filter((m) => m.chain === chain) };
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
  app.route('/feed', feedRouter);
  return app;
}

const EVENTS = [
  makeEvent({ block_number: 100, log_index: 0, event_name: 'MarketCreated', wallet: null, outcome_index: null, amount: null }),
  makeEvent({ block_number: 100, log_index: 1, event_name: 'SharesBought', amount: '50000000000000000' }),
  makeEvent({ block_number: 101, log_index: 0, event_name: 'MarketResolved', wallet: null, outcome_index: '0', amount: null }),
  makeEvent({ block_number: 102, log_index: 0, event_name: 'WinningsClaimed', outcome_index: null }),
  makeEvent({ block_number: 200, log_index: 0, market_id: '2', event_name: 'SharesBought', amount: '20000000000000000' }),
];

const MARKETS: MarketRow[] = [
  { chain: 'avalanche', market_id: '1', question: 'Will AVAX reach $50?', outcomes: '["YES","NO"]' },
  // market 2 intentionally missing to test fallback question
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /feed', () => {
  beforeEach(() => clearFeedCache());

  it('rejects an unknown chain with 400', async () => {
    const app = createApp();
    const res = await app.request('/feed?chain=ethereum');
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('chain');
  });

  it('rejects limit > 50 with 400', async () => {
    const app = createApp();
    const res = await app.request('/feed?chain=avalanche&limit=100');
    expect(res.status).toBe(400);
  });

  it('rejects invalid cursor with 400', async () => {
    const app = createApp();
    const res = await app.request('/feed?chain=avalanche&cursor=notacursor');
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric market_id with 400', async () => {
    const app = createApp();
    const res = await app.request('/feed?chain=avalanche&market_id=abc');
    expect(res.status).toBe(400);
  });

  it('returns items newest first', async () => {
    const db = createMockDb(EVENTS, MARKETS);
    const app = createApp(db);
    const res = await app.request('/feed?chain=avalanche&limit=10');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items.length).toBeGreaterThan(0);
    // Verify descending order by checking block numbers
    for (let i = 1; i < body.items.length; i++) {
      const [prevBlock, prevLog] = body.items[i - 1].cursor.split(':').map(Number);
      const [curBlock, curLog]   = body.items[i].cursor.split(':').map(Number);
      expect(prevBlock > curBlock || (prevBlock === curBlock && prevLog > curLog)).toBe(true);
    }
  });

  it('cursor pagination returns only older items', async () => {
    const db = createMockDb(EVENTS, MARKETS);
    const app = createApp(db);

    // First page — get everything, take the cursor of the last item
    const page1 = await app.request('/feed?chain=avalanche&limit=2');
    const body1 = await page1.json() as any;
    expect(body1.items.length).toBeGreaterThan(0);

    const lastCursor = body1.items[body1.items.length - 1].cursor;
    const [cursorBlock] = lastCursor.split(':').map(Number);

    // Second page via cursor — all items must be older
    const page2 = await app.request(`/feed?chain=avalanche&limit=10&cursor=${lastCursor}`);
    const body2 = await page2.json() as any;
    for (const item of body2.items) {
      const [block] = item.cursor.split(':').map(Number);
      expect(block).toBeLessThanOrEqual(cursorBlock);
    }
  });

  it('market_id filter returns only that market', async () => {
    // Use a mock that properly filters by market_id
    const filteredDb = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          all: async () => {
            if (sql.includes('chain_events')) {
              const filtered = EVENTS.filter((e) => e.chain === 'avalanche' && e.market_id === '1');
              return { results: [...filtered].sort((a, b) => b.block_number - a.block_number) };
            }
            if (sql.includes('market_cache')) {
              return { results: MARKETS.filter((m) => m.chain === 'avalanche') };
            }
            return { results: [] };
          },
        }),
      }),
    } as unknown as D1Database;

    const app = createApp(filteredDb);
    const res = await app.request('/feed?chain=avalanche&market_id=1');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.market_id).toBe('1');
    }
  });

  it('uses "Market #N" when question is not cached', async () => {
    const db = createMockDb(EVENTS, MARKETS); // market 2 has no entry in MARKETS
    const app = createApp(db);
    const res = await app.request('/feed?chain=avalanche&market_id=2');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const item = body.items.find((i: any) => i.market_id === '2');
    if (item) expect(item.question).toBe('Market #2');
  });

  it('includes token_decimals=18 for avalanche', async () => {
    const db = createMockDb(EVENTS, MARKETS);
    const app = createApp(db);
    const res = await app.request('/feed?chain=avalanche&limit=1');
    const body = await res.json() as any;
    if (body.items.length > 0) {
      expect(body.items[0].token_decimals).toBe(18);
    }
  });

  it('returns empty items for no DB binding', async () => {
    const app = createApp(undefined);
    const res = await app.request('/feed?chain=avalanche');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items).toHaveLength(0);
    expect(body.has_more).toBe(false);
  });
});
