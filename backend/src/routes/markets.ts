import { Hono } from 'hono';
import { rpc, Contract, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { createPublicClient, http, formatEther, type Address } from 'viem';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or, and } from 'drizzle-orm';
import { marketCache } from '../db/schema';

export type SupportedChain = 'stellar' | 'avalanche';

export interface CachedMarket {
  id: string;
  chain: SupportedChain;
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
  AVALANCHE_RPC_URL?: string;
  AVALANCHE_CONTRACT_ADDRESS?: string;
  DB?: D1Database;
}

const markets = new Hono<{ Bindings: EnvBindings }>();

// 30 seconds TTL in milliseconds
const CACHE_TTL_MS = 30 * 1000;

// Partitioned in-memory cache per chain to prevent collisions
interface ChainCacheState {
  markets: CachedMarket[];
  lastFetchedAt: number;
}

const inMemoryCache: Record<SupportedChain, ChainCacheState> = {
  stellar: { markets: [], lastFetchedAt: 0 },
  avalanche: { markets: [], lastFetchedAt: 0 },
};

// Minimal ABI for Avalanche PredictionMarket contract view functions
const PREDICTION_MARKET_ABI = [
  {
    type: 'function',
    name: 'marketCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMarket',
    inputs: [{ name: 'marketId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct PredictionMarket.Market',
        components: [
          { name: 'question', type: 'string', internalType: 'string' },
          { name: 'endTime', type: 'uint256', internalType: 'uint256' },
          { name: 'status', type: 'uint8', internalType: 'enum PredictionMarket.MarketStatus' },
          { name: 'outcome', type: 'bool', internalType: 'bool' },
          { name: 'yesPool', type: 'uint256', internalType: 'uint256' },
          { name: 'noPool', type: 'uint256', internalType: 'uint256' },
          { name: 'totalPool', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

/**
 * Fetches all markets from the Soroban smart contract.
 */
async function fetchMarketsFromStellar(
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
      countKey
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
            chain: 'stellar',
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

/**
 * Fetches all markets from the Avalanche Solidity smart contract.
 */
async function fetchMarketsFromAvalanche(
  rpcUrl: string,
  contractAddress: string
): Promise<CachedMarket[]> {
  if (!rpcUrl || !contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
    return [];
  }

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  let countBigInt = BigInt(0);
  try {
    countBigInt = (await client.readContract({
      address: contractAddress as Address,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'marketCount',
    })) as bigint;
  } catch (err) {
    console.warn('Failed to read marketCount from Avalanche:', err);
    return [];
  }

  const count = Number(countBigInt);
  if (count <= 0) {
    return [];
  }

  const results: CachedMarket[] = [];

  for (let id = 1; id <= count; id++) {
    try {
      const data = (await client.readContract({
        address: contractAddress as Address,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'getMarket',
        args: [BigInt(id)],
      })) as {
        question: string;
        endTime: bigint;
        status: number;
        outcome: boolean;
        yesPool: bigint;
        noPool: bigint;
        totalPool: bigint;
      };

      if (data) {
        const rawStatus = Number(data.status);
        const statusStr: 'open' | 'closed' | 'resolved' =
          rawStatus === 0 ? 'open' : 'resolved';
        const resolvedOutcome: 'yes' | 'no' | undefined =
          rawStatus !== 0 ? (data.outcome ? 'yes' : 'no') : undefined;

        const yesPool = Number(formatEther(data.yesPool));
        const noPool = Number(formatEther(data.noPool));
        const endTime = Number(data.endTime) * 1000;

        results.push({
          id: String(id),
          chain: 'avalanche',
          question: String(data.question || `Market #${id}`),
          category: 'General',
          endTime,
          status: statusStr,
          yesPool,
          noPool,
          resolvedOutcome,
          updatedAt: Date.now(),
        });
      }
    } catch {
      // Ignore individual market lookup failures
    }
  }

  return results;
}

/**
 * Ensures cache is populated for a given chain (checking in-memory, RPC, then D1).
 */
async function syncChainMarkets(
  chain: SupportedChain,
  c: { env?: EnvBindings }
): Promise<{ markets: CachedMarket[]; cached: boolean }> {
  const now = Date.now();
  const cacheEntry = inMemoryCache[chain];
  const isCacheValid = cacheEntry.markets.length > 0 && now - cacheEntry.lastFetchedAt < CACHE_TTL_MS;

  if (isCacheValid) {
    return { markets: cacheEntry.markets, cached: true };
  }

  let freshMarkets: CachedMarket[] = [];

  if (chain === 'stellar') {
    const rpcUrl = c.env?.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
    const contractId = c.env?.MARKET_CONTRACT_ID ?? '';
    try {
      if (contractId) {
        freshMarkets = await fetchMarketsFromStellar(rpcUrl, contractId);
      }
    } catch (err) {
      console.warn('Failed to fetch markets from Soroban RPC:', err);
    }
  } else if (chain === 'avalanche') {
    const rpcUrl = c.env?.AVALANCHE_RPC_URL ?? 'https://api.avax-test.network/ext/bc/C/rpc';
    const contractAddress = c.env?.AVALANCHE_CONTRACT_ADDRESS ?? '';
    try {
      if (contractAddress) {
        freshMarkets = await fetchMarketsFromAvalanche(rpcUrl, contractAddress);
      }
    } catch (err) {
      console.warn('Failed to fetch markets from Avalanche RPC:', err);
    }
  }

  if (freshMarkets.length > 0) {
    inMemoryCache[chain] = {
      markets: freshMarkets,
      lastFetchedAt: now,
    };

    // Write to D1 database with tagged chain composite key to guarantee no collision
    if (c.env?.DB) {
      try {
        const db = drizzle(c.env.DB);
        for (const m of freshMarkets) {
          const rowId = `${m.chain}:${m.id}`;
          await db
            .insert(marketCache)
            .values({
              id: rowId,
              marketId: m.id,
              chain: m.chain,
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
                marketId: m.id,
                chain: m.chain,
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
        console.warn(`D1 marketCache write error for chain ${chain}:`, dbErr);
      }
    }

    return { markets: freshMarkets, cached: false };
  }

  // Fallback: If RPC returned empty and in-memory cache is empty, check D1 database
  if (cacheEntry.markets.length === 0 && c.env?.DB) {
    try {
      const db = drizzle(c.env.DB);
      const stored = await db
        .select()
        .from(marketCache)
        .where(
          or(
            eq(marketCache.chain, chain),
            eq(marketCache.id, `${chain}:%`)
          )
        );

      if (stored.length > 0) {
        const dbMarkets: CachedMarket[] = stored.map((s) => ({
          id: s.marketId || (s.id.includes(':') ? s.id.split(':')[1] : s.id),
          chain: (s.chain as SupportedChain) || chain,
          question: s.question,
          category: s.category ?? 'General',
          endTime: s.endTime,
          status: s.status as 'open' | 'closed' | 'resolved',
          yesPool: s.yesPool ?? 0,
          noPool: s.noPool ?? 0,
          resolvedOutcome: (s.resolvedOutcome as 'yes' | 'no') || undefined,
          updatedAt: s.updatedAt,
        }));

        inMemoryCache[chain] = {
          markets: dbMarkets,
          lastFetchedAt: now,
        };

        return { markets: dbMarkets, cached: true };
      }
    } catch (dbErr) {
      console.warn(`D1 marketCache read error for chain ${chain}:`, dbErr);
    }
  }

  return { markets: cacheEntry.markets, cached: true };
}

// ── GET /markets ─────────────────────────────────────────────
// Supports ?chain=stellar | ?chain=avalanche | ?chain=all
markets.get('/', async (c) => {
  const chainParam = c.req.query('chain')?.toLowerCase();

  if (
    chainParam &&
    chainParam !== 'stellar' &&
    chainParam !== 'avalanche' &&
    chainParam !== 'all'
  ) {
    return c.json(
      {
        error: `Invalid chain parameter "${chainParam}". Supported chains: stellar, avalanche, all`,
      },
      400
    );
  }

  const targetChains: SupportedChain[] =
    chainParam === 'stellar'
      ? ['stellar']
      : chainParam === 'avalanche'
      ? ['avalanche']
      : ['stellar', 'avalanche'];

  let allMarkets: CachedMarket[] = [];
  let allCached = true;

  for (const chain of targetChains) {
    const result = await syncChainMarkets(chain, c);
    allMarkets = allMarkets.concat(result.markets);
    if (!result.cached) {
      allCached = false;
    }
  }

  const now = Date.now();
  const oldestFetch = Math.min(
    ...targetChains.map((ch) => inMemoryCache[ch].lastFetchedAt || now)
  );

  return c.json({
    markets: allMarkets,
    chain: chainParam ?? 'all',
    cached: allCached,
    ttlRemaining: Math.max(0, Math.round((CACHE_TTL_MS - (now - oldestFetch)) / 1000)),
  });
});

// ── GET /markets/:id ─────────────────────────────────────────
// Supports ?chain=stellar | ?chain=avalanche
markets.get('/:id', async (c) => {
  const id = c.req.param('id');
  const chainParam = c.req.query('chain')?.toLowerCase();

  if (
    chainParam &&
    chainParam !== 'stellar' &&
    chainParam !== 'avalanche'
  ) {
    return c.json(
      {
        error: `Invalid chain parameter "${chainParam}". Supported chains: stellar, avalanche`,
      },
      400
    );
  }

  const searchChains: SupportedChain[] =
    chainParam === 'stellar'
      ? ['stellar']
      : chainParam === 'avalanche'
      ? ['avalanche']
      : ['stellar', 'avalanche'];

  // 1. Search in-memory cache
  for (const chain of searchChains) {
    const found = inMemoryCache[chain].markets.find(
      (m) => m.id === id || `${chain}:${m.id}` === id
    );
    if (found) {
      return c.json({ market: found, cached: true });
    }
  }

  // 2. Search D1 database if bound
  if (c.env?.DB) {
    try {
      const db = drizzle(c.env.DB);
      const compositeId = chainParam ? `${chainParam}:${id}` : null;

      const [stored] = await db
        .select()
        .from(marketCache)
        .where(
          chainParam
            ? and(
                eq(marketCache.chain, chainParam),
                or(
                  eq(marketCache.marketId, id),
                  eq(marketCache.id, compositeId!),
                  eq(marketCache.id, id)
                )
              )
            : or(
                eq(marketCache.marketId, id),
                eq(marketCache.id, id),
                eq(marketCache.id, `stellar:${id}`),
                eq(marketCache.id, `avalanche:${id}`)
              )
        )
        .limit(1);

      if (stored) {
        const foundChain = (stored.chain as SupportedChain) || (stored.id.startsWith('avalanche:') ? 'avalanche' : 'stellar');
        const cleanId = stored.marketId || (stored.id.includes(':') ? stored.id.split(':')[1] : stored.id);

        return c.json({
          market: {
            id: cleanId,
            chain: foundChain,
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
    } catch (err) {
      console.warn('D1 marketCache lookup error:', err);
    }
  }

  return c.json({ error: `Market ${id} not found.` }, 404);
});

export default markets;
