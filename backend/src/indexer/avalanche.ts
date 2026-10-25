/**
 * indexer/avalanche.ts
 *
 * Indexes PredictionMarket (native AVAX) events from Avalanche Fuji into D1 chain_events.
 *
 * The Avalanche contract emits the same six events as PredictionMarketERC20 with
 * identical field names and types. Amounts are in wei (1 AVAX = 1e18 wei) and are
 * stored as raw base-unit strings — never floating point.
 *
 * Design mirrors sonic.ts — same checkpoint pattern, same INSERT OR IGNORE idempotency,
 * same batch/delay approach.
 */

import { createPublicClient, http, parseEventLogs, type Address } from 'viem';

// ── Inline ABI — the six events emitted by PredictionMarket (Avalanche) ──────
// Field names and types are identical to the Sonic ERC-20 contract.

export const AVALANCHE_EVENTS_ABI = [
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'marketId',          type: 'uint256', indexed: true  },
      { name: 'question',          type: 'string',  indexed: false },
      { name: 'outcomes',          type: 'string[]',indexed: false },
      { name: 'closeTime',         type: 'uint64',  indexed: false },
      { name: 'resolutionCriteria',type: 'string',  indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SharesBought',
    inputs: [
      { name: 'marketId',    type: 'uint256', indexed: true  },
      { name: 'buyer',       type: 'address', indexed: true  },
      { name: 'outcomeIndex',type: 'uint256', indexed: false },
      { name: 'amount',      type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId',      type: 'uint256', indexed: true  },
      { name: 'winningOutcome',type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketCancelled',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'WinningsClaimed',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true  },
      { name: 'claimer',  type: 'address', indexed: true  },
      { name: 'payout',   type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Refunded',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true  },
      { name: 'user',     type: 'address', indexed: true  },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
  },
] as const;

// ── Tuning ───────────────────────────────────────────────────────────────────

const BLOCK_RANGE_SIZE    = 100;   // Avalanche Fuji public RPC caps eth_getLogs at 100 blocks per request
const BATCH_DELAY_MS      = 150;   // shorter delay — Avalanche RPC is more permissive
const CONFIRMATION_BUFFER = 5;     // fewer confirmations needed on Avalanche
const MAX_RANGES_PER_RUN  = 10;    // max 10 batches per run so it finishes in ~1-2 seconds without freezing

// ── Types ────────────────────────────────────────────────────────────────────

export interface AvalancheIndexerEnv {
  DB:                        D1Database;
  AVALANCHE_RPC_URL?:        string;
  AVALANCHE_CONTRACT_ADDRESS?: string;
  AVALANCHE_START_BLOCK?:    string;
}

interface DecodedRow {
  txHash:       string;
  logIndex:     number;
  blockNumber:  number;
  blockTime:    number;
  eventName:    string;
  marketId:     string;
  wallet:       string | null;
  outcomeIndex: string | null;
  amount:       string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function readCheckpoint(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare('SELECT last_block FROM indexer_state WHERE chain = ?')
    .bind('avalanche')
    .first<{ last_block: number }>();
  return row?.last_block ?? null;
}

async function writeCheckpoint(db: D1Database, block: number): Promise<void> {
  await db
    .prepare(
      'INSERT INTO indexer_state (chain, last_block) VALUES (?, ?) ' +
      'ON CONFLICT(chain) DO UPDATE SET last_block = excluded.last_block',
    )
    .bind('avalanche', block)
    .run();
}

/**
 * Decode a raw Avalanche log into a DecodedRow.
 * Returns null for logs we don't recognise (e.g. OwnershipTransferred).
 */
export function decodeAvalancheLog(log: {
  transactionHash: string | null;
  logIndex:        number;
  blockNumber:     bigint;
  topics:          readonly string[];
  data:            string;
  address:         string;
}): Omit<DecodedRow, 'blockTime'> | null {
  let decoded: ReturnType<typeof parseEventLogs>[0] | undefined;
  try {
    const results = parseEventLogs({
      abi:  AVALANCHE_EVENTS_ABI,
      logs: [log as any],
    });
    decoded = results[0];
  } catch {
    return null;
  }
  if (!decoded) return null;

  const d = decoded as any;
  const a = d.args as Record<string, unknown>;
  const bn = Number(log.blockNumber);

  const base = {
    txHash:       log.transactionHash ?? '',
    logIndex:     log.logIndex,
    blockNumber:  bn,
    marketId:     String(a['marketId'] as bigint),
    wallet:       null as string | null,
    outcomeIndex: null as string | null,
    amount:       null as string | null,
  };

  switch (d.eventName as string) {
    case 'MarketCreated':
      return { ...base, eventName: 'MarketCreated' };

    case 'SharesBought':
      return {
        ...base,
        eventName:    'SharesBought',
        wallet:       (a['buyer'] as string).toLowerCase(),
        outcomeIndex: String(a['outcomeIndex'] as bigint),
        // amount in wei (native AVAX) stored as string — never float
        amount:       String(a['amount'] as bigint),
      };

    case 'MarketResolved':
      return {
        ...base,
        eventName:    'MarketResolved',
        outcomeIndex: String(a['winningOutcome'] as bigint),
      };

    case 'MarketCancelled':
      return { ...base, eventName: 'MarketCancelled' };

    case 'WinningsClaimed':
      return {
        ...base,
        eventName: 'WinningsClaimed',
        wallet:    (a['claimer'] as string).toLowerCase(),
        amount:    String(a['payout'] as bigint),
      };

    case 'Refunded':
      return {
        ...base,
        eventName: 'Refunded',
        wallet:    (a['user'] as string).toLowerCase(),
        amount:    String(a['amount'] as bigint),
      };

    default:
      return null;
  }
}

async function insertRows(db: D1Database, rows: DecodedRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO chain_events ' +
    '(chain, tx_hash, log_index, block_number, block_time, event_name, market_id, wallet, outcome_index, amount) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );

  const batch = rows.map((r) =>
    stmt.bind(
      'avalanche',
      r.txHash,
      r.logIndex,
      r.blockNumber,
      r.blockTime,
      r.eventName,
      r.marketId,
      r.wallet,
      r.outcomeIndex,
      r.amount,
    ),
  );

  const results = await db.batch(batch);
  return results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
}

// ── Main exported function ────────────────────────────────────────────────────

export interface AvalancheIndexerResult {
  rangesProcessed: number;
  logsDecoded:     number;
  rowsInserted:    number;
  fromBlock:       number;
  toBlock:         number;
  skipped:         boolean;
}

/**
 * runAvalancheIndexer — indexes Avalanche Fuji events into D1.
 * Exported so tests can call it directly.
 */
export async function runAvalancheIndexer(env: AvalancheIndexerEnv): Promise<AvalancheIndexerResult> {
  const rpcUrl          = env.AVALANCHE_RPC_URL          ?? 'https://api.avax-test.network/ext/bc/C/rpc';
  const contractAddress = env.AVALANCHE_CONTRACT_ADDRESS ?? '0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa';

  if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
    console.warn('[avalanche-indexer] AVALANCHE_CONTRACT_ADDRESS not configured — skipping');
    return { rangesProcessed: 0, logsDecoded: 0, rowsInserted: 0, fromBlock: 0, toBlock: 0, skipped: true };
  }

  const client = createPublicClient({ transport: http(rpcUrl) });

  const latestBlock = Number(await client.getBlockNumber());
  const safeLatest  = latestBlock - CONFIRMATION_BUFFER;

  const checkpoint   = await readCheckpoint(env.DB);
  const startDefault = Number(env.AVALANCHE_START_BLOCK ?? '59915671');
  const fromBlock    = checkpoint !== null ? checkpoint + 1 : startDefault;

  if (fromBlock > safeLatest) {
    return { rangesProcessed: 0, logsDecoded: 0, rowsInserted: 0, fromBlock, toBlock: safeLatest, skipped: true };
  }

  const blockTimeCache = new Map<number, number>();

  async function getBlockTime(blockNumber: number): Promise<number> {
    if (blockTimeCache.has(blockNumber)) return blockTimeCache.get(blockNumber)!;
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
    const ts = Number(block.timestamp);
    blockTimeCache.set(blockNumber, ts);
    return ts;
  }

  let totalLogsDecoded  = 0;
  let totalRowsInserted = 0;
  let rangesProcessed   = 0;
  let currentFrom = fromBlock;

  while (currentFrom <= safeLatest && rangesProcessed < MAX_RANGES_PER_RUN) {
    const currentTo = Math.min(currentFrom + BLOCK_RANGE_SIZE - 1, safeLatest);

    let rawLogs: Awaited<ReturnType<typeof client.getLogs>>;
    try {
      rawLogs = await client.getLogs({
        address:   contractAddress as Address,
        fromBlock: BigInt(currentFrom),
        toBlock:   BigInt(currentTo),
      });
    } catch (err) {
      console.error(`[avalanche-indexer] getLogs failed for blocks ${currentFrom}-${currentTo}:`, err);
      break;
    }

    const rows: DecodedRow[] = [];
    for (const log of rawLogs) {
      const partial = decodeAvalancheLog(log as any);
      if (!partial) continue;
      const blockTime = await getBlockTime(partial.blockNumber);
      rows.push({ ...partial, blockTime });
      totalLogsDecoded++;
    }

    const inserted = await insertRows(env.DB, rows);
    totalRowsInserted += inserted;

    await writeCheckpoint(env.DB, currentTo);
    rangesProcessed++;

    currentFrom = currentTo + 1;

    if (currentFrom <= safeLatest) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return {
    rangesProcessed,
    logsDecoded:  totalLogsDecoded,
    rowsInserted: totalRowsInserted,
    fromBlock,
    toBlock: Math.min(currentFrom - 1, safeLatest),
    skipped: false,
  };
}
