import { describe, it, expect, vi } from 'vitest';
import { decodeAvalancheLog, runAvalancheIndexer, AVALANCHE_EVENTS_ABI } from './avalanche';
import { encodeEventTopics, encodeAbiParameters, parseAbiParameters, keccak256, toBytes } from 'viem';

// ── Helpers ──────────────────────────────────────────────────────────────────

function eventTopic(eventName: string): string {
  const abi = AVALANCHE_EVENTS_ABI.find((e) => e.name === eventName);
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

const CONTRACT = '0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa';

function makeSig(tag: string): string {
  return keccak256(toBytes('avax-sig-' + tag));
}

// ── decodeAvalancheLog unit tests ─────────────────────────────────────────────

describe('decodeAvalancheLog', () => {
  it('decodes MarketCreated', () => {
    const data = encodeAbiParameters(
      parseAbiParameters('string, string[], uint64, string'),
      ['Will AVAX reach $50?', ['YES', 'NO'], BigInt(9999999), 'owner decides'],
    );
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('mc'),
      logIndex: 0,
      blockNumber: BigInt(59915680),
      topics: [eventTopic('MarketCreated'), pad32(BigInt(1))] as any,
      data,
    };
    const row = decodeAvalancheLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('MarketCreated');
    expect(row!.marketId).toBe('1');
    expect(row!.wallet).toBeNull();
    expect(row!.amount).toBeNull();
  });

  it('decodes SharesBought with amount in wei', () => {
    const buyer = '0x376cBCdec2cEC23092363DD04031FBf091B450E9';
    const data = encodeAbiParameters(
      parseAbiParameters('uint256, uint256'),
      [BigInt(0), BigInt('10000000000000000')], // 0.01 AVAX in wei
    );
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('sb'),
      logIndex: 1,
      blockNumber: BigInt(59915685),
      topics: [eventTopic('SharesBought'), pad32(BigInt(1)), pad32(buyer)] as any,
      data,
    };
    const row = decodeAvalancheLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('SharesBought');
    expect(row!.wallet).toBe(buyer.toLowerCase());
    expect(row!.outcomeIndex).toBe('0');
    expect(row!.amount).toBe('10000000000000000'); // stored as wei string, never float
  });

  it('decodes MarketResolved', () => {
    const data = encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(1)]);
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('mr'),
      logIndex: 0,
      blockNumber: BigInt(59916000),
      topics: [eventTopic('MarketResolved'), pad32(BigInt(1))] as any,
      data,
    };
    const row = decodeAvalancheLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('MarketResolved');
    expect(row!.outcomeIndex).toBe('1');
    expect(row!.wallet).toBeNull();
    expect(row!.amount).toBeNull();
  });

  it('decodes MarketCancelled', () => {
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('mca'),
      logIndex: 0,
      blockNumber: BigInt(59917000),
      topics: [eventTopic('MarketCancelled'), pad32(BigInt(2))] as any,
      data: '0x',
    };
    const row = decodeAvalancheLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('MarketCancelled');
    expect(row!.marketId).toBe('2');
    expect(row!.wallet).toBeNull();
    expect(row!.amount).toBeNull();
  });

  it('decodes WinningsClaimed', () => {
    const claimer = '0xDdbCAA073FCbEf81f18946E9e93815C4d1c0338C';
    const data = encodeAbiParameters(
      parseAbiParameters('uint256'),
      [BigInt('40000000000000000')], // 0.04 AVAX payout in wei
    );
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('wc'),
      logIndex: 0,
      blockNumber: BigInt(59918000),
      topics: [eventTopic('WinningsClaimed'), pad32(BigInt(1)), pad32(claimer)] as any,
      data,
    };
    const row = decodeAvalancheLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('WinningsClaimed');
    expect(row!.wallet).toBe(claimer.toLowerCase());
    expect(row!.amount).toBe('40000000000000000');
  });

  it('decodes Refunded', () => {
    const user = '0x376cBCdec2cEC23092363DD04031FBf091B450E9';
    const data = encodeAbiParameters(
      parseAbiParameters('uint256'),
      [BigInt('10000000000000000')],
    );
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('ref'),
      logIndex: 2,
      blockNumber: BigInt(59919000),
      topics: [eventTopic('Refunded'), pad32(BigInt(3)), pad32(user)] as any,
      data,
    };
    const row = decodeAvalancheLog(log as any);
    expect(row).not.toBeNull();
    expect(row!.eventName).toBe('Refunded');
    expect(row!.wallet).toBe(user.toLowerCase());
    expect(row!.amount).toBe('10000000000000000');
  });

  it('returns null for unrecognised logs', () => {
    const log = {
      address: CONTRACT,
      transactionHash: makeSig('unknown'),
      logIndex: 0,
      blockNumber: BigInt(59920000),
      topics: ['0xdeadbeef00000000000000000000000000000000000000000000000000000000'] as any,
      data: '0x',
    };
    expect(decodeAvalancheLog(log as any)).toBeNull();
  });
});

// ── runAvalancheIndexer integration tests ─────────────────────────────────────

function createMockDb(initialCheckpoint: number | null = null) {
  const events: Record<string, unknown>[] = [];
  const state = new Map<string, number>(
    initialCheckpoint !== null ? [['avalanche', initialCheckpoint]] : [],
  );

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes('INSERT OR IGNORE INTO chain_events')) {
                const [chain, txHash, logIndex] = args as string[];
                const exists = events.some(
                  (e) => e.chain === chain && e.tx_hash === txHash && e.log_index === logIndex,
                );
                if (!exists) {
                  events.push({ chain, tx_hash: txHash, log_index: logIndex });
                }
                return { meta: { changes: exists ? 0 : 1 } };
              }
              if (sql.includes('INSERT INTO indexer_state') || sql.includes('ON CONFLICT')) {
                state.set('avalanche', args[1] as number);
              }
              return { meta: { changes: 1 } };
            },
            async first<T>(): Promise<T | null> {
              if (sql.includes('SELECT last_block FROM indexer_state')) {
                const v = state.get('avalanche');
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

  return db as unknown as D1Database & { _events: typeof events; _state: typeof state };
}

describe('runAvalancheIndexer', () => {
  it('skips when contract address is not configured', async () => {
    const db = createMockDb(null);
    const result = await runAvalancheIndexer({ DB: db as any, AVALANCHE_CONTRACT_ADDRESS: '' });
    expect(result.skipped).toBe(true);
  });

  it('is idempotent — running the same range twice inserts rows only once', async () => {
    const mockLog = {
      address: CONTRACT,
      transactionHash: makeSig('idem-avax'),
      logIndex: 0,
      blockNumber: BigInt(59915680),
      topics: [
        eventTopic('SharesBought'),
        pad32(BigInt(1)),
        pad32('0x376cBCdec2cEC23092363DD04031FBf091B450E9'),
      ],
      data: encodeAbiParameters(parseAbiParameters('uint256, uint256'), [BigInt(0), BigInt('10000000000000000')]),
    };

    vi.mock('viem', async (importOriginal) => {
      const actual = await importOriginal<typeof import('viem')>();
      return {
        ...actual,
        createPublicClient: () => ({
          getBlockNumber: async () => BigInt(59915780),
          getBlock: async () => ({ timestamp: BigInt(1_700_000_000) }),
          getLogs: async () => [mockLog],
        }),
      };
    });

    const db = createMockDb(59915671);

    await runAvalancheIndexer({ DB: db as any, AVALANCHE_CONTRACT_ADDRESS: CONTRACT });
    const countAfterFirst = db._events.length;

    const result2 = await runAvalancheIndexer({ DB: db as any, AVALANCHE_CONTRACT_ADDRESS: CONTRACT });
    expect(db._events.length).toBe(countAfterFirst);
    expect(result2.rowsInserted).toBe(0);

    vi.restoreAllMocks();
  });

  it('resumes from checkpoint after a simulated failure', async () => {
    const db = createMockDb(59916000);
    let callCount = 0;

    vi.mock('viem', async (importOriginal) => {
      const actual = await importOriginal<typeof import('viem')>();
      return {
        ...actual,
        createPublicClient: () => ({
          getBlockNumber: async () => BigInt(59920000),
          getBlock: async () => ({ timestamp: BigInt(1_700_000_000) }),
          getLogs: async () => {
            callCount++;
            if (callCount === 1) throw new Error('simulated RPC failure');
            return [];
          },
        }),
      };
    });

    await runAvalancheIndexer({ DB: db as any, AVALANCHE_CONTRACT_ADDRESS: CONTRACT });

    // Checkpoint must not advance past 59916000 due to failure
    expect(db._state.get('avalanche')).toBe(59916000);

    vi.restoreAllMocks();
  });
});
