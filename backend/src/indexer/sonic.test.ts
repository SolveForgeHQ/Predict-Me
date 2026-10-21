import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeLog, runSonicIndexer, SONIC_EVENTS_ABI } from './sonic';
import { encodeEventTopics, encodeAbiParameters, parseAbiParameters, toHex, keccak256, toBytes } from 'viem';

// ── Helpers to build synthetic raw logs ─────────────────────────────────────

function eventTopic(eventName: string): string {
  const abi = SONIC_EVENTS_ABI.find((e) => e.name === eventName);
  if (!abi) throw new Error(`Unknown event: ${eventName}`);
  const topics = encodeEventTopics({ abi: [abi] as any, eventName: eventName as any });
  return topics[0] as string;
}

function pad32(n: bigint | string | number): string {
  const hex = typeof n === 'string' && n.startsWith('0x')
    ? n.slice(2)
    : BigInt(n).toString(16);
  return '0x' + hex.padStart(64, '0');
}

const CONTRACT = '0x25D035CB295d94A073107aAB9Ac86a3655a5614E';

function makeSig(extraTag: string = ''): string {
  return keccak256(toBytes('fakesig' + extraTag));
}

// ── decodeLog unit tests ─────────────────────────────────────────────────────

describe('decodeLog', () => {
  it('decodes MarketCreated', () => {
    // MarketCreated(marketId indexed, question, outcomes[], closeTime, resolutionCriteria)
    // Non-indexed args are ABI-encoded in data
    const marketId = BigInt(1);
    const data = encodeAbiParameters(
      parseAbiParameters('string, string[], uint64, string'),
      ['Will it rain?', ['YES', 'NO'], BigInt(9999999), 'owner decides'],
    );

    const log = {
      address: CONTRACT,
      transactionHash: makeSig('1'),
      logIndex: 0,
      blockNumber: BigInt(100),
      topics: [eventTopic('MarketCreated'), pad32(marketId)] as any,
      data,
    };

    const row = decodeLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('MarketCreated');
    expect(row!.marketId).toBe('1');
    expect(row!.wallet).toBeNull();
    expect(row!.outcomeIndex).toBeNull();
    expect(row!.amount).toBeNull();
  });

  it('decodes SharesBought', () => {
    const marketId = BigInt(2);
    const buyer    = '0xaabbccddEEff0000000000000000000000000001';
    const data     = encodeAbiParameters(
      parseAbiParameters('uint256, uint256'),
      [BigInt(0), BigInt(5_000_000)],   // outcomeIndex=0, amount=5 USDC
    );

    const log = {
      address: CONTRACT,
      transactionHash: makeSig('2'),
      logIndex: 1,
      blockNumber: BigInt(200),
      topics: [
        eventTopic('SharesBought'),
        pad32(marketId),
        pad32(buyer),
      ] as any,
      data,
    };

    const row = decodeLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('SharesBought');
    expect(row!.marketId).toBe('2');
    expect(row!.wallet).toBe(buyer.toLowerCase());
    expect(row!.outcomeIndex).toBe('0');
    expect(row!.amount).toBe('5000000');
  });

  it('decodes MarketResolved', () => {
    const marketId = BigInt(3);
    const data     = encodeAbiParameters(
      parseAbiParameters('uint256'),
      [BigInt(1)],   // winningOutcome = 1 (NO)
    );

    const log = {
      address: CONTRACT,
      transactionHash: makeSig('3'),
      logIndex: 0,
      blockNumber: BigInt(300),
      topics: [eventTopic('MarketResolved'), pad32(marketId)] as any,
      data,
    };

    const row = decodeLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('MarketResolved');
    expect(row!.marketId).toBe('3');
    expect(row!.outcomeIndex).toBe('1');
    expect(row!.wallet).toBeNull();
    expect(row!.amount).toBeNull();
  });

  it('decodes MarketCancelled', () => {
    const marketId = BigInt(4);
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('4'),
      logIndex: 0,
      blockNumber: BigInt(400),
      topics: [eventTopic('MarketCancelled'), pad32(marketId)] as any,
      data: '0x',
    };

    const row = decodeLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('MarketCancelled');
    expect(row!.marketId).toBe('4');
    expect(row!.wallet).toBeNull();
    expect(row!.outcomeIndex).toBeNull();
    expect(row!.amount).toBeNull();
  });

  it('decodes WinningsClaimed', () => {
    const marketId = BigInt(2);
    const claimer  = '0xDdbCAA073FCbEf81f18946E9e93815C4d1c0338C';
    const data     = encodeAbiParameters(
      parseAbiParameters('uint256'),
      [BigInt(60_000_000)],   // payout = 60 USDC
    );

    const log = {
      address: CONTRACT,
      transactionHash: makeSig('5'),
      logIndex: 0,
      blockNumber: BigInt(500),
      topics: [
        eventTopic('WinningsClaimed'),
        pad32(marketId),
        pad32(claimer),
      ] as any,
      data,
    };

    const row = decodeLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('WinningsClaimed');
    expect(row!.marketId).toBe('2');
    expect(row!.wallet).toBe(claimer.toLowerCase());
    expect(row!.outcomeIndex).toBeNull();
    expect(row!.amount).toBe('60000000');
  });

  it('decodes Refunded', () => {
    const marketId = BigInt(4);
    const user     = '0xf58b1234000000000000000000000000FFE2aabb';
    const data     = encodeAbiParameters(
      parseAbiParameters('uint256'),
      [BigInt(10_000_000)],   // amount = 10 USDC
    );

    const log = {
      address: CONTRACT,
      transactionHash: makeSig('6'),
      logIndex: 2,
      blockNumber: BigInt(600),
      topics: [
        eventTopic('Refunded'),
        pad32(marketId),
        pad32(user),
      ] as any,
      data,
    };

    const row = decodeLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('Refunded');
    expect(row!.marketId).toBe('4');
    expect(row!.wallet).toBe(user.toLowerCase());
    expect(row!.amount).toBe('10000000');
  });

  it('returns null for unrecognised logs', () => {
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('99'),
      logIndex: 0,
      blockNumber: BigInt(999),
      topics: ['0xdeadbeef00000000000000000000000000000000000000000000000000000000'] as any,
      data: '0x',
    };
    expect(decodeLog(log as any)).toBeNull();
  });
});

// ── runSonicIndexer integration tests (with in-memory D1 mock) ───────────────

interface Row { [key: string]: unknown }

/** Minimal D1-compatible in-memory stub. */
function createMockDb(initialCheckpoint: number | null = null) {
  const events: Row[] = [];
  const state: Map<string, number> = new Map(
    initialCheckpoint !== null ? [['sonic', initialCheckpoint]] : [],
  );

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes('INSERT OR IGNORE INTO chain_events')) {
                const [chain, txHash, logIndex, blockNumber, blockTime,
                       eventName, marketId, wallet, outcomeIndex, amount] = args as string[];
                // enforce UNIQUE(chain, tx_hash, log_index)
                const exists = events.some(
                  (e) => e.chain === chain && e.tx_hash === txHash && e.log_index === logIndex,
                );
                if (!exists) {
                  events.push({ chain, tx_hash: txHash, log_index: logIndex,
                    block_number: blockNumber, block_time: blockTime,
                    event_name: eventName, market_id: marketId,
                    wallet, outcome_index: outcomeIndex, amount });
                }
                return { meta: { changes: exists ? 0 : 1 } };
              }
              if (sql.includes('INSERT INTO indexer_state') || sql.includes('ON CONFLICT')) {
                state.set('sonic', args[1] as number);
              }
              return { meta: { changes: 1 } };
            },
            async first<T>(): Promise<T | null> {
              if (sql.includes('SELECT last_block FROM indexer_state')) {
                const v = state.get('sonic');
                return v !== undefined ? ({ last_block: v } as unknown as T) : null;
              }
              return null;
            },
          };
        },
      };
    },
    async batch(stmts: { run(): Promise<{ meta: { changes: number } }> }[]) {
      return Promise.all(stmts.map((s) => s.run()));
    },
    _events: events,
    _state: state,
  };

  return db as unknown as D1Database & { _events: Row[]; _state: Map<string, number> };
}

describe('runSonicIndexer', () => {
  it('is idempotent — running the same range twice inserts rows only once', async () => {
    // Mock viem client that returns a single SharesBought log
    const mockLog = {
      address: CONTRACT,
      transactionHash: makeSig('idem'),
      logIndex: 0,
      blockNumber: BigInt(19_241_100),
      topics: [
        eventTopic('SharesBought'),
        pad32(BigInt(1)),
        pad32('0xaabbccddEEff0000000000000000000000000001'),
      ],
      data: encodeAbiParameters(
        parseAbiParameters('uint256, uint256'),
        [BigInt(0), BigInt(1_000_000)],
      ),
    };

    vi.mock('viem', async (importOriginal) => {
      const actual = await importOriginal<typeof import('viem')>();
      return {
        ...actual,
        createPublicClient: () => ({
          getBlockNumber: async () => BigInt(19_241_200),
          getBlock: async () => ({ timestamp: BigInt(1_700_000_000) }),
          getLogs: async () => [mockLog],
        }),
      };
    });

    const db = createMockDb(19_241_084);

    const result1 = await runSonicIndexer({
      DB: db as any,
      SONIC_RPC_URL: 'https://rpc.testnet.soniclabs.com',
      SONIC_CONTRACT_ADDRESS: CONTRACT,
      SONIC_START_BLOCK: '19241084',
    });
    const countAfterFirst = db._events.length;

    const result2 = await runSonicIndexer({
      DB: db as any,
      SONIC_RPC_URL: 'https://rpc.testnet.soniclabs.com',
      SONIC_CONTRACT_ADDRESS: CONTRACT,
      SONIC_START_BLOCK: '19241084',
    });
    const countAfterSecond = db._events.length;

    expect(countAfterFirst).toBe(countAfterSecond);
    // rowsInserted on second run should be 0 (all ignored)
    expect(result2.rowsInserted).toBe(0);

    vi.restoreAllMocks();
  });

  it('resumes from checkpoint after a simulated failure', async () => {
    // Checkpoint is at block 19_241_500 (simulating a previous successful run)
    const db = createMockDb(19_241_500);

    let callCount = 0;
    vi.mock('viem', async (importOriginal) => {
      const actual = await importOriginal<typeof import('viem')>();
      return {
        ...actual,
        createPublicClient: () => ({
          getBlockNumber: async () => BigInt(19_242_000),
          getBlock: async () => ({ timestamp: BigInt(1_700_000_000) }),
          getLogs: async ({ fromBlock }: { fromBlock: bigint }) => {
            callCount++;
            // Fail the first call to simulate an RPC error mid-run
            if (callCount === 1) throw new Error('simulated RPC failure');
            return [];
          },
        }),
      };
    });

    const result = await runSonicIndexer({
      DB: db as any,
      SONIC_RPC_URL: 'https://rpc.testnet.soniclabs.com',
      SONIC_CONTRACT_ADDRESS: CONTRACT,
      SONIC_START_BLOCK: '19241084',
    });

    // Should have stopped after the failure without advancing checkpoint past 19_241_500
    expect(db._state.get('sonic')).toBe(19_241_500);
    expect(result.rangesProcessed).toBe(0);

    vi.restoreAllMocks();
  });

  it('skips when contract address is not configured', async () => {
    const db = createMockDb(null);
    const result = await runSonicIndexer({
      DB: db as any,
      SONIC_CONTRACT_ADDRESS: '',
    });
    expect(result.skipped).toBe(true);
  });
});
