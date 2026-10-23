/**
 * indexer/sonic.ts
 *
 * Indexes PredictionMarketERC20 events from Sonic testnet into D1 chain_events.
 *
 * Design:
 * - Reads indexer_state.last_block for "sonic" to find the resume point.
 * - Falls back to SONIC_START_BLOCK (env) on the very first run.
 * - Works in BLOCK_RANGE_SIZE chunks; pauses BATCH_DELAY_MS between each.
 * - Stops at (latestBlock - CONFIRMATION_BUFFER) to avoid reorgs.
 * - Decodes all six contract events using viem parseEventLogs.
 * - Caches block timestamps within a single indexer run (never persisted).
 * - Inserts with INSERT OR IGNORE (idempotent — safe to re-run any range).
 * - Updates indexer_state only AFTER all rows for a range are stored,
 *   so a failure never causes skipped blocks.
 */

import { createPublicClient, http, parseEventLogs, type Address } from 'viem';

// ── Inline ABI — only the six events we index ───────────────────────────────
// Keeping this inline avoids a cross-workspace import at runtime in Workers.

export const SONIC_EVENTS_ABI = [
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

// ── Tuning constants ─────────────────────────────────────────────────────────

const BLOCK_RANGE_SIZE    = 1_000; // blocks per getLogs request
const BATCH_DELAY_MS      = 300;   // pause between consecutive requests
const CONFIRMATION_BUFFER = 10;    // stay behind latest to avoid reorgs

// ── Types ────────────────────────────────────────────────────────────────────

export interface IndexerEnv {
  DB:                   D1Database;
  SONIC_RPC_URL?:       string;
  SONIC_CONTRACT_ADDRESS?: string;
  SONIC_START_BLOCK?:   string;   // fallback for first run
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

/** Read last_block for sonic from D1. Returns null if no row exists yet. */
async function readCheckpoint(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare('SELECT last_block FROM indexer_state WHERE chain = ?')
    .bind('sonic')
    .first<{ last_block: number }>();
  return row?.last_block ?? null;
}

/** Upsert the checkpoint AFTER a range's rows are safely stored. */
async function writeCheckpoint(db: D1Database, block: number): Promise<void> {
  await db
    .prepare(
      'INSERT INTO indexer_state (chain, last_block) VALUES (?, ?) ' +
      'ON CONFLICT(chain) DO UPDATE SET last_block = excluded.last_block',
    )
    .bind('sonic', block)
    .run();
}

/**
 * Decode a raw log into a DecodedRow.
 * Returns null for logs we don't recognise (e.g. OwnershipTransferred).
 */
export function decodeLog(log: {
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
      abi:  SONIC_EVENTS_ABI,
      logs: [log as any],
    });
    decoded = results[0];
  } catch {
    return null;
  }
  if (!decoded) return null;

  const d  = decoded as any;
  const a  = d.args as Record<string, unknown>;
  const bn = Number(log.blockNumber);

  const base = {
    txHash:      log.transactionHash ?? '',
    logIndex:    log.logIndex,
    blockNumber: bn,
    marketId:    String(a['marketId'] as bigint),
    wallet:      null as string | null,
    outcomeIndex:null as string | null,
    amount:      null as string | null,
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

/** Bulk-insert rows with INSERT OR IGNORE for idempotency. */
async function insertRows(db: D1Database, rows: DecodedRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO chain_events ' +
    '(chain, tx_hash, log_index, block_number, block_time, event_name, market_id, wallet, outcome_index, amount) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );

  const batch = rows.map((r) =>
    stmt.bind(
      'sonic',
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

export interface IndexerResult {
  rangesProcessed: number;
  logsDecoded:     number;
  rowsInserted:    number;
  fromBlock:       number;
  toBlock:         number;
  skipped:         boolean;   // true when already up to date
}

/**
 * runSonicIndexer — indexes Sonic events into D1.
 *
 * Exported so tests can call it directly without going through the cron handler.
 */
export async function runSonicIndexer(env: IndexerEnv): Promise<IndexerResult> {
  const rpcUrl          = env.SONIC_RPC_URL          ?? 'https://rpc.testnet.soniclabs.com';
  const contractAddress = env.SONIC_CONTRACT_ADDRESS ?? '';

  if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
    console.warn('[indexer] SONIC_CONTRACT_ADDRESS not configured — skipping');
    return { rangesProcessed: 0, logsDecoded: 0, rowsInserted: 0, fromBlock: 0, toBlock: 0, skipped: true };
  }

  const client = createPublicClient({ transport: http(rpcUrl) });

  // ── Determine range ──────────────────────────────────────────
  const latestBlock  = Number(await client.getBlockNumber());
  const safeLatest   = latestBlock - CONFIRMATION_BUFFER;

  const checkpoint   = await readCheckpoint(env.DB);
  const startDefault = Number(env.SONIC_START_BLOCK ?? '0');
  const fromBlock    = checkpoint !== null ? checkpoint + 1 : startDefault;

  if (fromBlock > safeLatest) {
    return { rangesProcessed: 0, logsDecoded: 0, rowsInserted: 0, fromBlock, toBlock: safeLatest, skipped: true };
  }

  // ── Block timestamp cache (per-run, not persisted) ───────────
  const blockTimeCache = new Map<number, number>();

  async function getBlockTime(blockNumber: number): Promise<number> {
    if (blockTimeCache.has(blockNumber)) return blockTimeCache.get(blockNumber)!;
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
    const ts    = Number(block.timestamp);
    blockTimeCache.set(blockNumber, ts);
    return ts;
  }

  // ── Process ranges ────────────────────────────────────────────
  let totalLogsDecoded = 0;
  let totalRowsInserted = 0;
  let rangesProcessed   = 0;
  let currentFrom = fromBlock;

  while (currentFrom <= safeLatest) {
    const currentTo = Math.min(currentFrom + BLOCK_RANGE_SIZE - 1, safeLatest);

    // Fetch logs for this range
    let rawLogs: Awaited<ReturnType<typeof client.getLogs>>;
    try {
      rawLogs = await client.getLogs({
        address:   contractAddress as Address,
        fromBlock: BigInt(currentFrom),
        toBlock:   BigInt(currentTo),
      });
    } catch (err) {
      console.error(`[indexer] getLogs failed for blocks ${currentFrom}-${currentTo}:`, err);
      // Don't advance checkpoint — will retry next cron run
      break;
    }

    // Decode + fetch timestamps
    const rows: DecodedRow[] = [];
    for (const log of rawLogs) {
      const partial = decodeLog(log as any);
      if (!partial) continue;

      const blockTime = await getBlockTime(partial.blockNumber);
      rows.push({ ...partial, blockTime });
      totalLogsDecoded++;
    }

    // Insert (idempotent)
    const inserted = await insertRows(env.DB, rows);
    totalRowsInserted += inserted;

    // Advance checkpoint ONLY after successful storage
    await writeCheckpoint(env.DB, currentTo);
    rangesProcessed++;

    currentFrom = currentTo + 1;

    // Rate-limit guard: pause between batches
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
