/**
 * stats/leaderboard.ts
 *
 * Computes user performance metrics and leaderboard rankings directly from raw chain_events.
 * Pure TypeScript functions with NO database calls inside the math for deterministic,
 * isolated unit testing.
 *
 * Rules:
 * 1. Only markets with a MarketResolved event count. Cancelled markets are ignored completely.
 * 2. total_stake = sum of SharesBought across all outcomes.
 *    entitled_payout = (stake on winning outcome * total_pool) / winning_outcome_pool (BigInt math).
 *    Do NOT rely on WinningsClaimed for profit calculation (unclaimed winners still count).
 * 3. net_profit = entitled_payout - total_stake (BigInt, can be negative).
 * 4. Win is counted ONLY when entitled_payout > total_stake. (Backing every side yields no win).
 * 5. win_rate = wins / resolved markets participated in.
 * 6. Season = UTC week (Monday 00:00:00 start) of the MarketResolved event's block_time.
 * 7. Minimum resolved markets threshold (default MIN_RESOLVED_MARKETS = 5).
 * 8. Ranking: net_profit DESC, ties broken by resolvedMarketsCount DESC, then firstActivityTime ASC.
 */

export const MIN_RESOLVED_MARKETS = 5;

export const CHAIN_TOKEN_DECIMALS: Record<string, number> = {
  sonic: 6,
  avalanche: 18,
  stellar: 7,
};

export interface ChainEventInput {
  chain: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTime: number; // Unix timestamp in seconds
  eventName: string; // 'MarketCreated' | 'SharesBought' | 'MarketResolved' | 'MarketCancelled' | 'WinningsClaimed' | 'Refunded'
  marketId: string;
  wallet?: string | null;
  outcomeIndex?: string | null;
  amount?: string | null; // Token/native base units as string
}

export interface WalletMarketStat {
  marketKey: string;
  chain: string;
  marketId: string;
  totalStake: bigint;
  winningStake: bigint;
  entitledPayout: bigint;
  netProfit: bigint;
  isWin: boolean;
  hasClaimed: boolean;
  resolvedTime: number;
  season: string;
}

export interface WalletStats {
  wallet: string;
  netProfit: bigint;
  totalStake: bigint;
  totalPayout: bigint;
  wins: number;
  resolvedMarketsCount: number;
  winRate: number; // 0.0 to 1.0
  firstActivityTime: number; // earliest blockTime across all events for this wallet
  markets: WalletMarketStat[];
}

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  netProfit: bigint;
  totalStake: bigint;
  totalPayout: bigint;
  wins: number;
  resolvedMarketsCount: number;
  winRate: number;
  firstActivityTime: number;
}

export interface LeaderboardOptions {
  /** 'all' or ISO week ID like '2026-W43' */
  season?: string;
  /** Minimum resolved markets required to appear on the profit leaderboard (default 5) */
  minResolvedMarkets?: number;
}

export interface SeasonWindow {
  start: string;
  end: string;
  startTimestamp: number;
  endTimestamp: number;
}

export interface WalletStatsResult {
  wallet: string;
  rank: number | null;
  marketsNeeded: number;
  netProfit: bigint;
  totalStake: bigint;
  totalPayout: bigint;
  resolvedMarketsCount: number;
  wins: number;
  winRate: number;
}

/**
 * Rule 6: Season calculation
 * Returns the ISO week identifier (e.g. "2026-W43") for a Unix timestamp in seconds.
 * A week starts on Monday at 00:00:00 UTC and ends on Sunday at 23:59:59 UTC.
 */
export function getSeasonWeekId(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  // ISO day: 1 (Mon) to 7 (Sun)
  const dayOfWeek = date.getUTCDay() || 7;
  // Thursday in current week determines the ISO year
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNumber = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Returns the UTC date window (Monday 00:00:00 to Sunday 23:59:59 UTC)
 * for a given ISO week ID (e.g. "2026-W43").
 */
export function getSeasonWindow(weekId: string): SeasonWindow | null {
  const match = weekId.match(/^(\d{4})-W(0[1-9]|[1-4][0-9]|5[0-3])$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // In ISO 8601, Jan 4th is guaranteed to be in Week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() || 7; // 1 (Mon) to 7 (Sun)
  const week1MondayMs = jan4.getTime() - (jan4DayOfWeek - 1) * 86400000;
  const targetMondayMs = week1MondayMs + (week - 1) * 7 * 86400000;
  const targetSundayEndMs = targetMondayMs + 7 * 86400000 - 1;

  const startTimestamp = Math.floor(targetMondayMs / 1000);
  const endTimestamp = Math.floor(targetSundayEndMs / 1000);

  return {
    start: new Date(targetMondayMs).toISOString(),
    end: new Date(targetSundayEndMs).toISOString(),
    startTimestamp,
    endTimestamp,
  };
}

/**
 * Computes user performance and ranked leaderboard from an array of chain events.
 */
export function computeLeaderboard(
  events: ChainEventInput[],
  options: LeaderboardOptions = {}
): LeaderboardEntry[] {
  const minResolvedMarkets = options.minResolvedMarkets ?? MIN_RESOLVED_MARKETS;
  const targetSeason = options.season ?? 'all';

  // ── 1. Group events by market composite key (chain:marketId) ───────────────
  const marketsMap = new Map<
    string,
    {
      chain: string;
      marketId: string;
      isCancelled: boolean;
      resolvedEvent?: ChainEventInput;
      sharesBought: ChainEventInput[];
      claimedEvents: ChainEventInput[];
    }
  >();

  // Track earliest activity time per wallet across ALL events
  const walletFirstActivity = new Map<string, number>();

  for (const ev of events) {
    if (ev.wallet) {
      const normalizedWallet = ev.wallet.toLowerCase();
      const currentFirst = walletFirstActivity.get(normalizedWallet);
      if (currentFirst === undefined || ev.blockTime < currentFirst) {
        walletFirstActivity.set(normalizedWallet, ev.blockTime);
      }
    }

    const key = `${ev.chain}:${ev.marketId}`;
    let m = marketsMap.get(key);
    if (!m) {
      m = {
        chain: ev.chain,
        marketId: ev.marketId,
        isCancelled: false,
        sharesBought: [],
        claimedEvents: [],
      };
      marketsMap.set(key, m);
    }

    if (ev.eventName === 'MarketCancelled') {
      // Rule 1: Cancelled markets are ignored completely
      m.isCancelled = true;
    } else if (ev.eventName === 'MarketResolved') {
      m.resolvedEvent = ev;
    } else if (ev.eventName === 'SharesBought') {
      m.sharesBought.push(ev);
    } else if (ev.eventName === 'WinningsClaimed') {
      m.claimedEvents.push(ev);
    }
  }

  // ── 2. Filter for valid resolved markets matching the target season ────────
  // Rule 1: Only markets with MarketResolved count; Cancelled markets are ignored
  interface ValidMarket {
    key: string;
    chain: string;
    marketId: string;
    winningOutcomeIndex: string;
    totalPool: bigint;
    winningPool: bigint;
    resolvedTime: number;
    season: string;
    sharesBought: ChainEventInput[];
    claimsByWallet: Set<string>;
  }

  const validMarkets: ValidMarket[] = [];

  for (const [key, m] of marketsMap.entries()) {
    if (m.isCancelled || !m.resolvedEvent || m.resolvedEvent.outcomeIndex === null || m.resolvedEvent.outcomeIndex === undefined) {
      continue;
    }

    // Rule 6: Season filter based on MarketResolved block_time
    const resolvedTime = m.resolvedEvent.blockTime;
    const season = getSeasonWeekId(resolvedTime);
    if (targetSeason !== 'all' && season !== targetSeason) {
      continue;
    }

    const winningOutcomeIndex = String(m.resolvedEvent.outcomeIndex);

    // Compute market total pool and winning pool
    let totalPool = 0n;
    let winningPool = 0n;

    for (const sb of m.sharesBought) {
      const amt = BigInt(sb.amount ?? '0');
      totalPool += amt;
      if (String(sb.outcomeIndex) === winningOutcomeIndex) {
        winningPool += amt;
      }
    }

    const claimsByWallet = new Set<string>();
    for (const c of m.claimedEvents) {
      if (c.wallet) {
        claimsByWallet.add(c.wallet.toLowerCase());
      }
    }

    validMarkets.push({
      key,
      chain: m.chain,
      marketId: m.marketId,
      winningOutcomeIndex,
      totalPool,
      winningPool,
      resolvedTime,
      season,
      sharesBought: m.sharesBought,
      claimsByWallet,
    });
  }

  // ── 3. Calculate per-wallet stats across resolved markets ──────────────────
  const walletStatsMap = new Map<string, WalletStats>();

  for (const market of validMarkets) {
    // Group this market's shares by wallet and outcome
    const walletMarketStakes = new Map<
      string,
      { totalStake: bigint; winningStake: bigint }
    >();

    for (const sb of market.sharesBought) {
      if (!sb.wallet) continue;
      const w = sb.wallet.toLowerCase();
      const amt = BigInt(sb.amount ?? '0');
      let entry = walletMarketStakes.get(w);
      if (!entry) {
        entry = { totalStake: 0n, winningStake: 0n };
        walletMarketStakes.set(w, entry);
      }
      entry.totalStake += amt;
      if (String(sb.outcomeIndex) === market.winningOutcomeIndex) {
        entry.winningStake += amt;
      }
    }

    // Evaluate each participating wallet for this market
    for (const [w, stakes] of walletMarketStakes.entries()) {
      // Rule 2: Entitled payout = (winningStake * totalPool) / winningPool using BigInt math
      // Unclaimed winners still count; claims used only to flag hasClaimed
      let entitledPayout = 0n;
      if (market.winningPool > 0n && stakes.winningStake > 0n) {
        entitledPayout = (stakes.winningStake * market.totalPool) / market.winningPool;
      }

      // Rule 3: net_profit = entitled_payout - total_stake (can be negative)
      const netProfit = entitledPayout - stakes.totalStake;

      // Rule 4: Win is counted ONLY when entitled_payout > total_stake
      // Backing every side with equal or losing return results in isWin = false
      const isWin = entitledPayout > stakes.totalStake;

      const hasClaimed = market.claimsByWallet.has(w);

      const marketStat: WalletMarketStat = {
        marketKey: market.key,
        chain: market.chain,
        marketId: market.marketId,
        totalStake: stakes.totalStake,
        winningStake: stakes.winningStake,
        entitledPayout,
        netProfit,
        isWin,
        hasClaimed,
        resolvedTime: market.resolvedTime,
        season: market.season,
      };

      let userStats = walletStatsMap.get(w);
      if (!userStats) {
        userStats = {
          wallet: w,
          netProfit: 0n,
          totalStake: 0n,
          totalPayout: 0n,
          wins: 0,
          resolvedMarketsCount: 0,
          winRate: 0,
          firstActivityTime: walletFirstActivity.get(w) ?? market.resolvedTime,
          markets: [],
        };
        walletStatsMap.set(w, userStats);
      }

      userStats.netProfit += netProfit;
      userStats.totalStake += stakes.totalStake;
      userStats.totalPayout += entitledPayout;
      if (isWin) {
        userStats.wins += 1;
      }
      userStats.resolvedMarketsCount += 1;
      userStats.markets.push(marketStat);
    }
  }

  // ── 4. Compute win rate & filter by minimum resolved markets ───────────────
  const eligibleEntries: Omit<LeaderboardEntry, 'rank'>[] = [];

  for (const stats of walletStatsMap.values()) {
    // Rule 5: win_rate = wins / resolved markets participated in
    stats.winRate = stats.resolvedMarketsCount > 0
      ? stats.wins / stats.resolvedMarketsCount
      : 0;

    // Rule 7: A wallet appears on profit leaderboard only after MIN_RESOLVED_MARKETS
    if (stats.resolvedMarketsCount >= minResolvedMarkets) {
      eligibleEntries.push({
        wallet: stats.wallet,
        netProfit: stats.netProfit,
        totalStake: stats.totalStake,
        totalPayout: stats.totalPayout,
        wins: stats.wins,
        resolvedMarketsCount: stats.resolvedMarketsCount,
        winRate: stats.winRate,
        firstActivityTime: stats.firstActivityTime,
      });
    }
  }

  // ── 5. Ranking & Tie-breaking ──────────────────────────────────────────────
  // Rule 8: net_profit DESC, ties broken by resolvedMarketsCount DESC, then firstActivityTime ASC
  eligibleEntries.sort((a, b) => {
    if (b.netProfit !== a.netProfit) {
      return b.netProfit > a.netProfit ? 1 : -1;
    }
    if (b.resolvedMarketsCount !== a.resolvedMarketsCount) {
      return b.resolvedMarketsCount - a.resolvedMarketsCount;
    }
    return a.firstActivityTime - b.firstActivityTime;
  });

  // Assign ranks (1-indexed)
  return eligibleEntries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

/**
 * Computes individual wallet stats and its rank on the leaderboard.
 * Even if the wallet is below the minimum market threshold, rank is null
 * and marketsNeeded indicates how many more resolved markets are required.
 */
export function computeWalletStats(
  events: ChainEventInput[],
  targetWallet: string,
  options: LeaderboardOptions = {}
): WalletStatsResult {
  const minResolvedMarkets = options.minResolvedMarkets ?? MIN_RESOLVED_MARKETS;
  const normalizedTarget = targetWallet.toLowerCase();

  // 1. Compute official ranked leaderboard
  const officialLeaderboard = computeLeaderboard(events, {
    ...options,
    minResolvedMarkets,
  });

  const rankedEntry = officialLeaderboard.find(
    (e) => e.wallet.toLowerCase() === normalizedTarget
  );

  if (rankedEntry) {
    return {
      wallet: targetWallet,
      rank: rankedEntry.rank,
      marketsNeeded: 0,
      netProfit: rankedEntry.netProfit,
      totalStake: rankedEntry.totalStake,
      totalPayout: rankedEntry.totalPayout,
      resolvedMarketsCount: rankedEntry.resolvedMarketsCount,
      wins: rankedEntry.wins,
      winRate: rankedEntry.winRate,
    };
  }

  // 2. If not on official leaderboard, compute totals with minResolvedMarkets = 1
  const unrankedLeaderboard = computeLeaderboard(events, {
    ...options,
    minResolvedMarkets: 1,
  });

  const participantEntry = unrankedLeaderboard.find(
    (e) => e.wallet.toLowerCase() === normalizedTarget
  );

  if (participantEntry) {
    return {
      wallet: targetWallet,
      rank: null,
      marketsNeeded: Math.max(0, minResolvedMarkets - participantEntry.resolvedMarketsCount),
      netProfit: participantEntry.netProfit,
      totalStake: participantEntry.totalStake,
      totalPayout: participantEntry.totalPayout,
      resolvedMarketsCount: participantEntry.resolvedMarketsCount,
      wins: participantEntry.wins,
      winRate: participantEntry.winRate,
    };
  }

  // 3. Wallet has not participated in any resolved markets for this season/chain
  return {
    wallet: targetWallet,
    rank: null,
    marketsNeeded: minResolvedMarkets,
    netProfit: 0n,
    totalStake: 0n,
    totalPayout: 0n,
    resolvedMarketsCount: 0,
    wins: 0,
    winRate: 0,
  };
}
