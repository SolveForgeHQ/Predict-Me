import { describe, it, expect } from 'vitest';
import {
  computeLeaderboard,
  getSeasonWeekId,
  type ChainEventInput,
} from './leaderboard';

// Helper to create synthetic chain events
function makeEvent(partial: Partial<ChainEventInput> & { eventName: string; marketId: string }): ChainEventInput {
  return {
    chain: partial.chain ?? 'avalanche',
    txHash: partial.txHash ?? `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`,
    logIndex: partial.logIndex ?? 0,
    blockNumber: partial.blockNumber ?? 1000,
    blockTime: partial.blockTime ?? 1792800000, // default timestamp
    eventName: partial.eventName,
    marketId: partial.marketId,
    wallet: partial.wallet ? partial.wallet.toLowerCase() : null,
    outcomeIndex: partial.outcomeIndex !== undefined ? String(partial.outcomeIndex) : null,
    amount: partial.amount !== undefined ? String(partial.amount) : null,
  };
}

describe('leaderboard stats module', () => {
  // ── 1. Binary win ──────────────────────────────────────────────────────────
  it('correctly calculates profit, win, and win rate for a binary win', () => {
    const events: ChainEventInput[] = [
      // Market 1: Alice bets 40 on YES (0), Bob bets 60 on NO (1)
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xAlice', outcomeIndex: '0', amount: '40000000000000000000' }), // 40
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xBob',   outcomeIndex: '1', amount: '60000000000000000000' }), // 60
      // Resolves YES (0)
      makeEvent({ eventName: 'MarketResolved', marketId: '1', outcomeIndex: '0' }),
    ];

    const result = computeLeaderboard(events, { minResolvedMarkets: 1 });
    expect(result).toHaveLength(2);

    const alice = result.find((r) => r.wallet === '0xalice')!;
    expect(alice.rank).toBe(1);
    expect(alice.totalStake).toBe(40000000000000000000n);
    expect(alice.totalPayout).toBe(100000000000000000000n);
    expect(alice.netProfit).toBe(60000000000000000000n);
    expect(alice.wins).toBe(1);
    expect(alice.resolvedMarketsCount).toBe(1);
    expect(alice.winRate).toBe(1.0);
  });

  // ── 2. Binary loss ─────────────────────────────────────────────────────────
  it('correctly calculates profit and zero wins for a binary loss', () => {
    const events: ChainEventInput[] = [
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xAlice', outcomeIndex: '0', amount: '40000000000000000000' }),
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xBob',   outcomeIndex: '1', amount: '60000000000000000000' }),
      makeEvent({ eventName: 'MarketResolved', marketId: '1', outcomeIndex: '0' }),
    ];

    const result = computeLeaderboard(events, { minResolvedMarkets: 1 });
    const bob = result.find((r) => r.wallet === '0xbob')!;
    expect(bob.rank).toBe(2);
    expect(bob.totalStake).toBe(60000000000000000000n);
    expect(bob.totalPayout).toBe(0n);
    expect(bob.netProfit).toBe(-60000000000000000000n);
    expect(bob.wins).toBe(0);
    expect(bob.resolvedMarketsCount).toBe(1);
    expect(bob.winRate).toBe(0.0);
  });

  // ── 3. 4-outcome market ───────────────────────────────────────────────────
  it('correctly calculates proportional payout on a 4-outcome market', () => {
    // 4 outcomes: 0, 1, 2, 3 with 25 stake each. Charlie backs outcome 2.
    const events: ChainEventInput[] = [
      makeEvent({ eventName: 'SharesBought', marketId: '10', wallet: '0xAlice',   outcomeIndex: '0', amount: '25000000' }),
      makeEvent({ eventName: 'SharesBought', marketId: '10', wallet: '0xBob',     outcomeIndex: '1', amount: '25000000' }),
      makeEvent({ eventName: 'SharesBought', marketId: '10', wallet: '0xCharlie', outcomeIndex: '2', amount: '25000000' }),
      makeEvent({ eventName: 'SharesBought', marketId: '10', wallet: '0xDave',    outcomeIndex: '3', amount: '25000000' }),
      // Outcome 2 wins
      makeEvent({ eventName: 'MarketResolved', marketId: '10', outcomeIndex: '2' }),
    ];

    const result = computeLeaderboard(events, { minResolvedMarkets: 1 });
    const charlie = result.find((r) => r.wallet === '0xcharlie')!;
    expect(charlie.totalStake).toBe(25000000n);
    expect(charlie.totalPayout).toBe(100000000n);
    expect(charlie.netProfit).toBe(75000000n);
    expect(charlie.wins).toBe(1);
    expect(charlie.winRate).toBe(1.0);

    const dave = result.find((r) => r.wallet === '0xdave')!;
    expect(dave.totalStake).toBe(25000000n);
    expect(dave.totalPayout).toBe(0n);
    expect(dave.netProfit).toBe(-25000000n);
    expect(dave.wins).toBe(0);
  });

  // ── 4. Cancelled market excluded ──────────────────────────────────────────
  it('completely excludes cancelled markets from stake, profit, and counts', () => {
    const events: ChainEventInput[] = [
      // Market 1 is resolved
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xAlice', outcomeIndex: '0', amount: '500' }),
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xBob',   outcomeIndex: '1', amount: '500' }),
      makeEvent({ eventName: 'MarketResolved', marketId: '1', outcomeIndex: '0' }),

      // Market 2 is cancelled
      makeEvent({ eventName: 'SharesBought', marketId: '2', wallet: '0xAlice', outcomeIndex: '0', amount: '10000' }),
      makeEvent({ eventName: 'SharesBought', marketId: '2', wallet: '0xBob',   outcomeIndex: '1', amount: '10000' }),
      makeEvent({ eventName: 'MarketCancelled', marketId: '2' }),
    ];

    const result = computeLeaderboard(events, { minResolvedMarkets: 1 });
    const alice = result.find((r) => r.wallet === '0xalice')!;
    // Only Market 1 counts
    expect(alice.resolvedMarketsCount).toBe(1);
    expect(alice.totalStake).toBe(500n);
    expect(alice.netProfit).toBe(500n); // 1000 payout - 500 stake
  });

  // ── 5. Unclaimed winner counted ───────────────────────────────────────────
  it('counts entitled payout for winners who have not claimed yet', () => {
    const events: ChainEventInput[] = [
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xAlice', outcomeIndex: '0', amount: '100' }),
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xBob',   outcomeIndex: '1', amount: '100' }),
      makeEvent({ eventName: 'MarketResolved', marketId: '1', outcomeIndex: '0' }),
      // NO WinningsClaimed event for 0xAlice
    ];

    const result = computeLeaderboard(events, { minResolvedMarkets: 1 });
    const alice = result.find((r) => r.wallet === '0xalice')!;
    expect(alice.totalPayout).toBe(200n);
    expect(alice.netProfit).toBe(100n);
    expect(alice.wins).toBe(1);
  });

  // ── 6. Wallet backing both sides gets no win ──────────────────────────────
  it('does NOT count a win if wallet backed both sides and payout <= stake', () => {
    // Eve hedges completely: bets 50 on YES and 50 on NO (total stake = 100)
    const events: ChainEventInput[] = [
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xEve', outcomeIndex: '0', amount: '50' }),
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xEve', outcomeIndex: '1', amount: '50' }),
      makeEvent({ eventName: 'MarketResolved', marketId: '1', outcomeIndex: '0' }),
    ];

    const result = computeLeaderboard(events, { minResolvedMarkets: 1 });
    const eve = result.find((r) => r.wallet === '0xeve')!;
    expect(eve.totalStake).toBe(100n);
    expect(eve.totalPayout).toBe(100n);
    expect(eve.netProfit).toBe(0n);
    // Rule 4: payout > stake is FALSE (100 is not > 100)
    expect(eve.wins).toBe(0);
    expect(eve.winRate).toBe(0.0);
  });

  // ── 7. Minimum markets threshold ──────────────────────────────────────────
  it('excludes wallets with fewer than minResolvedMarkets (default 5)', () => {
    const events: ChainEventInput[] = [];

    // Alice participates in 5 resolved markets
    for (let i = 1; i <= 5; i++) {
      events.push(makeEvent({ eventName: 'SharesBought', marketId: String(i), wallet: '0xAlice', outcomeIndex: '0', amount: '10' }));
      events.push(makeEvent({ eventName: 'SharesBought', marketId: String(i), wallet: '0xOther', outcomeIndex: '1', amount: '10' }));
      events.push(makeEvent({ eventName: 'MarketResolved', marketId: String(i), outcomeIndex: '0' }));
    }

    // Bob has huge profit but only in 4 resolved markets
    for (let i = 6; i <= 9; i++) {
      events.push(makeEvent({ eventName: 'SharesBought', marketId: String(i), wallet: '0xBob', outcomeIndex: '0', amount: '1000' }));
      events.push(makeEvent({ eventName: 'SharesBought', marketId: String(i), wallet: '0xOther', outcomeIndex: '1', amount: '1000' }));
      events.push(makeEvent({ eventName: 'MarketResolved', marketId: String(i), outcomeIndex: '0' }));
    }

    // Default threshold is 5
    const resultDefault = computeLeaderboard(events);
    expect(resultDefault.find((r) => r.wallet === '0xalice')).toBeDefined();
    expect(resultDefault.find((r) => r.wallet === '0xbob')).toBeUndefined();

    // Custom threshold of 4 lets Bob appear
    const resultFour = computeLeaderboard(events, { minResolvedMarkets: 4 });
    expect(resultFour.find((r) => r.wallet === '0xbob')).toBeDefined();
    expect(resultFour[0].wallet).toBe('0xbob'); // Bob ranks first due to higher profit
  });

  // ── 8. Season boundary at Sunday 23:59 vs Monday 00:00 UTC ────────────────
  it('correctly handles week boundaries at Sunday 23:59:59 vs Monday 00:00:00 UTC', () => {
    // Sunday Oct 25, 2026 23:59:59 UTC
    const sundayTime = Date.UTC(2026, 9, 25, 23, 59, 59) / 1000;
    // Monday Oct 26, 2026 00:00:00 UTC
    const mondayTime = Date.UTC(2026, 9, 26, 0, 0, 0) / 1000;

    const sundayWeek = getSeasonWeekId(sundayTime);
    const mondayWeek = getSeasonWeekId(mondayTime);

    expect(sundayWeek).toBe('2026-W43');
    expect(mondayWeek).toBe('2026-W44');

    const events: ChainEventInput[] = [
      // Market 1 resolved on Sunday
      makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xAlice', outcomeIndex: '0', amount: '100', blockTime: sundayTime }),
      makeEvent({ eventName: 'MarketResolved', marketId: '1', outcomeIndex: '0', blockTime: sundayTime }),

      // Market 2 resolved on Monday
      makeEvent({ eventName: 'SharesBought', marketId: '2', wallet: '0xAlice', outcomeIndex: '0', amount: '200', blockTime: mondayTime }),
      makeEvent({ eventName: 'MarketResolved', marketId: '2', outcomeIndex: '0', blockTime: mondayTime }),
    ];

    // Filter by Sunday's season (2026-W43)
    const resultSun = computeLeaderboard(events, { season: '2026-W43', minResolvedMarkets: 1 });
    expect(resultSun).toHaveLength(1);
    expect(resultSun[0].resolvedMarketsCount).toBe(1);
    expect(resultSun[0].totalStake).toBe(100n);

    // Filter by Monday's season (2026-W44)
    const resultMon = computeLeaderboard(events, { season: '2026-W44', minResolvedMarkets: 1 });
    expect(resultMon).toHaveLength(1);
    expect(resultMon[0].resolvedMarketsCount).toBe(1);
    expect(resultMon[0].totalStake).toBe(200n);

    // Filter by 'all' includes both
    const resultAll = computeLeaderboard(events, { season: 'all', minResolvedMarkets: 1 });
    expect(resultAll[0].resolvedMarketsCount).toBe(2);
    expect(resultAll[0].totalStake).toBe(300n);
  });

  // ── 9. Ties broken by markets count, then earlier first activity ───────────
  it('breaks ties using resolvedMarketsCount DESC, then firstActivityTime ASC', () => {
    const events: ChainEventInput[] = [];

    // Alice: Profit = +100 across 2 markets (first activity t = 500)
    events.push(makeEvent({ eventName: 'SharesBought', marketId: '1', wallet: '0xAlice', outcomeIndex: '0', amount: '50', blockTime: 500 }));
    events.push(makeEvent({ eventName: 'MarketResolved', marketId: '1', outcomeIndex: '0' }));
    events.push(makeEvent({ eventName: 'SharesBought', marketId: '2', wallet: '0xAlice', outcomeIndex: '0', amount: '50', blockTime: 600 }));
    events.push(makeEvent({ eventName: 'MarketResolved', marketId: '2', outcomeIndex: '0' }));

    // Bob: Profit = +100 in 1 market (first activity t = 200)
    events.push(makeEvent({ eventName: 'SharesBought', marketId: '3', wallet: '0xBob', outcomeIndex: '0', amount: '100', blockTime: 200 }));
    events.push(makeEvent({ eventName: 'MarketResolved', marketId: '3', outcomeIndex: '0' }));

    // Charlie: Profit = +100 in 1 market (first activity t = 800)
    events.push(makeEvent({ eventName: 'SharesBought', marketId: '4', wallet: '0xCharlie', outcomeIndex: '0', amount: '100', blockTime: 800 }));
    events.push(makeEvent({ eventName: 'MarketResolved', marketId: '4', outcomeIndex: '0' }));

    const result = computeLeaderboard(events, { minResolvedMarkets: 1 });

    // Net profit is equal for all three (+100).
    // Tie-breaker 1: Alice has 2 resolved markets, so ranks #1.
    expect(result[0].wallet).toBe('0xalice');
    expect(result[0].rank).toBe(1);

    // Tie-breaker 2: Bob and Charlie both have 1 resolved market.
    // Bob's first activity (t=200) is earlier than Charlie's (t=800), so Bob ranks #2 and Charlie #3.
    expect(result[1].wallet).toBe('0xbob');
    expect(result[1].rank).toBe(2);
    expect(result[2].wallet).toBe('0xcharlie');
    expect(result[2].rank).toBe(3);
  });
});
