import { Hono } from 'hono';
import { rpc, Contract, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { marketCache } from '../db/schema';

export interface CachedMarket {
  id: string;
  question: string;
  category: string;
  endTime: number;
  status: 'open' | 'closed' | 'resolved';
  yesPool: number;
  noPool: number;
  resolvedOutcome?: 'yes' | 'no';
  updatedAt: number;
}

interface EnvBindings {
  SOROBAN_RPC_URL?: string;
  MARKET_CONTRACT_ID?: string;
  DB?: D1Database;
}

const markets = new Hono<{ Bindings: EnvBindings }>();

// 30 seconds TTL in milliseconds
const CACHE_TTL_MS = 30 * 1000;

// In-memory cache for fast Workers response
let inMemoryCache: CachedMarket[] = [];
let lastFetchedAt = 0;

/**
 * Fetches all markets from the Soroban smart contract.
 */
async function fetchMarketsFromChain(
  rpcUrl: string,
  contractId: string
): Promise<CachedMarket[]> {
  if (!rpcUrl || !contractId) {
    return [];
  }

  const server = new rpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith('http://'),
  });
  const contract = new Contract(contractId);

  // 1. Read total market count: DataKey::MarketCount
  let marketCount = 0;
  try {
    const countKey = xdr.ScVal.scvVec([
      nativeToScVal('MarketCount', { type: 'symbol' }),
    ]);

    const entry = await server.getContractData(
      contract.address(),
      countKey,
      rpc.Durability.Instance
    );

    if (entry && entry.val) {
      const val = scValToNative(entry.val.contractData().val());
      if (typeof val === 'number') marketCount = val;
      else if (typeof val === 'bigint') marketCount = Number(val);
    }
  } catch {
    // If MarketCount key not initialized, assume 0
    marketCount = 0;
  }

  if (marketCount === 0) {
    return [];
  }

  // 2. Read each market: DataKey::Market(u32)
  const results: CachedMarket[] = [];

  for (let id = 1; id <= marketCount; id++) {
    try {
      const marketKey = xdr.ScVal.scvVec([
        nativeToScVal('Market', { type: 'symbol' }),
        nativeToScVal(id, { type: 'u32' }),
      ]);

      const entry = await server.getContractData(
        contract.address(),
        marketKey,
        rpc.Durability.Persistent
      );

      if (entry && entry.val) {
        const state = scValToNative(entry.val.contractData().val());
        if (state) {
          const rawStatus = Number(state.status ?? 0);
          const statusStr: 'open' | 'closed' | 'resolved' =
            rawStatus === 0 ? 'open' : 'resolved';
          const resolvedOutcome: 'yes' | 'no' | undefined =
            rawStatus === 1 ? 'yes' : rawStatus === 2 ? 'no' : undefined;

          const yesPool = state.yes_pool ? Number(state.yes_pool) / 10_000_000 : 0;
          const noPool = state.no_pool ? Number(state.no_pool) / 10_000_000 : 0;
          const endTimestamp = state.end_timestamp
            ? Number(state.end_timestamp) * 1000
            : Date.now() + 86400000;

          results.push({
            id: String(id),
            question: String(state.question ?? `Market #${id}`),
            category: String(state.category ?? 'General'),
            endTime: endTimestamp,
            status: statusStr,
            yesPool,
            noPool,
            resolvedOutcome,
            updatedAt: Date.now(),
          });
        }
      }
    } catch {
      // Ignore individual market lookup failures
    }
  }

  return results;
}

// ── GET /markets ─────────────────────────────────────────────
markets.get('/', async (c) => {
  const now = Date.now();
  const isCacheValid = inMemoryCache.length > 0 && now - lastFetchedAt < CACHE_TTL_MS;

  if (isCacheValid) {
    return c.json({
      markets: inMemoryCache,
      cached: true,
      ttlRemaining: Math.max(0, Math.round((CACHE_TTL_MS - (now - lastFetchedAt)) / 1000)),
    });
  }

  const rpcUrl =
    c.env?.SOROBAN_RPC_URL ??
    'https://soroban-testnet.stellar.org';
  const contractId =
    c.env?.MARKET_CONTRACT_ID ??
    '';

  let freshMarkets: CachedMarket[] = [];

  try {
    if (contractId) {
      freshMarkets = await fetchMarketsFromChain(rpcUrl, contractId);
    }
  } catch (err) {
    console.warn('Failed to fetch markets from Soroban RPC:', err);
  }

  // If chain returned data, update caches
  if (freshMarkets.length > 0) {
    inMemoryCache = freshMarkets;
    lastFetchedAt = now;

    // Write to D1 database if bound
    if (c.env?.DB) {
      try {
        const db = drizzle(c.env.DB);
        for (const m of freshMarkets) {
          await db
            .insert(marketCache)
            .values({
              id: m.id,
              question: m.question,
              category: m.category,
              endTime: m.endTime,
              status: m.status,
              yesPool: m.yesPool,
              noPool: m.noPool,
              resolvedOutcome: m.resolvedOutcome,
              updatedAt: m.updatedAt,
            })
            .onConflictDoUpdate({
              target: marketCache.id,
              set: {
                question: m.question,
                category: m.category,
                endTime: m.endTime,
                status: m.status,
                yesPool: m.yesPool,
                noPool: m.noPool,
                resolvedOutcome: m.resolvedOutcome,
                updatedAt: m.updatedAt,
              },
            });
        }
      } catch (dbErr) {
        console.warn('D1 marketCache write error:', dbErr);
      }
    }
  } else if (inMemoryCache.length === 0) {
    // If chain returned empty and cache is empty, check D1 database
    if (c.env?.DB) {
      try {
        const db = drizzle(c.env.DB);
        const stored = await db.select().from(marketCache);
        if (stored.length > 0) {
          inMemoryCache = stored.map((s) => ({
            id: s.id,
            question: s.question,
            category: s.category ?? 'General',
            endTime: s.endTime,
            status: s.status as 'open' | 'closed' | 'resolved',
            yesPool: s.yesPool ?? 0,
            noPool: s.noPool ?? 0,
            resolvedOutcome: (s.resolvedOutcome as 'yes' | 'no') || undefined,
            updatedAt: s.updatedAt,
          }));
          lastFetchedAt = now;
        }
      } catch (dbErr) {
        console.warn('D1 marketCache read error:', dbErr);
      }
    }
  }

  return c.json({
    markets: inMemoryCache,
    cached: false,
    ttlRemaining: 30,
  });
});

// ── GET /markets/:id ─────────────────────────────────────────
markets.get('/:id', async (c) => {
  const id = c.req.param('id');
  const market = inMemoryCache.find((m) => m.id === id);

  if (market) {
    return c.json({ market, cached: true });
  }

  if (c.env?.DB) {
    try {
      const db = drizzle(c.env.DB);
      const [stored] = await db
        .select()
        .from(marketCache)
        .where(eq(marketCache.id, id))
        .limit(1);

      if (stored) {
        return c.json({
          market: {
            id: stored.id,
            question: stored.question,
            category: stored.category ?? 'General',
            endTime: stored.endTime,
            status: stored.status,
            yesPool: stored.yesPool ?? 0,
            noPool: stored.noPool ?? 0,
            resolvedOutcome: stored.resolvedOutcome ?? undefined,
            updatedAt: stored.updatedAt,
          },
          cached: true,
        });
      }
    } catch {
      // Ignore DB error
    }
  }

  return c.json({ error: `Market ${id} not found.` }, 404);
});

export default markets;
