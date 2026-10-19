export type MarketStatus = "open" | "closed" | "resolved";
export type Outcome = "yes" | "no";

export const MIN_OUTCOMES = 2;
export const MAX_OUTCOMES = 32;
export const BINARY_OUTCOMES: string[] = ["YES", "NO"];

export interface Market {
  id: string;
  question: string;
  category?: string;
  endTime: number; // Unix timestamp (ms)
  status: MarketStatus;
  /** Canonical outcome labels, N >= 2. Binary markets use ["YES","NO"]. */
  outcomes: string[];
  /** Canonical per-outcome pools, same length as outcomes. */
  pools: number[];
  totalPool?: number;
  resolvedOutcomeIndex?: number;
  // ── Backward-compat (derived when outcomes.length === 2) ──
  yesPool?: number;
  noPool?: number;
  resolvedOutcome?: Outcome | string;
}

export interface Position {
  userId: string;
  marketId: string;
  /** Canonical per-outcome balances, same length as market outcomes. */
  balances: number[];
  // ── Backward-compat (derived when balances.length === 2) ──
  yesShares?: number;
  noShares?: number;
  avgYesPrice?: number | null;
  avgNoPrice?: number | null;
}

export interface User {
  walletAddress: string;
  handle: string | null;
  avatar: string | null;
  totalPoints: number;
}

export interface CreateMarketParams {
  question: string;
  endTime: number; // Unix timestamp in seconds or ms
  category?: string;
  /** N >= 2 labels. Defaults to ["YES","NO"] for binary compat. */
  outcomes?: string[];
  callerAddress?: string;
}

export interface BuySharesParams {
  marketId: string;
  /** Canonical winning outcome index. */
  outcomeIndex?: number;
  /** Legacy / convenience: "yes"->0, "no"->1 (N=2), number, or label string. */
  outcome?: Outcome | string | number;
  amount: number; // In token units (e.g. XLM or AVAX)
  callerAddress?: string;
}

export interface ResolveMarketParams {
  marketId: string;
  /** Canonical winning outcome index. */
  winningOutcomeIndex?: number;
  /** Legacy / convenience: "yes"->0, "no"->1, number, or label string. */
  outcome?: Outcome | string | number;
  callerAddress?: string;
}

export interface ClaimWinningsParams {
  marketId: string;
  callerAddress?: string;
}

export interface TransactionResult<T = void> {
  txHash: string;
  data?: T;
}

// ── Helpers (single code path: binary is N=2) ──

export function normalizeOutcomes(outcomes?: string[]): string[] {
  if (!outcomes || outcomes.length === 0) return [...BINARY_OUTCOMES];
  return [...outcomes];
}

export function validateOutcomes(outcomes: string[]): void {
  if (outcomes.length < MIN_OUTCOMES) throw new Error("At least 2 outcomes required");
  if (outcomes.length > MAX_OUTCOMES) throw new Error("Too many outcomes");
  for (const label of outcomes) {
    if (!label || label.trim().length === 0) throw new Error("Outcome label must not be empty");
  }
}

/** Resolve a Buy/Resolve param to a canonical outcome index. */
export function resolveOutcomeIndex(
  params: { outcomeIndex?: number; outcome?: string | number },
  outcomes: string[],
): number {
  if (params.outcomeIndex !== undefined) {
    if (!Number.isInteger(params.outcomeIndex) || params.outcomeIndex < 0 || params.outcomeIndex >= outcomes.length) {
      throw new Error("Invalid outcome index");
    }
    return params.outcomeIndex;
  }
  const o = params.outcome;
  if (typeof o === "number") {
    if (!Number.isInteger(o) || o < 0 || o >= outcomes.length) throw new Error("Invalid outcome index");
    return o;
  }
  if (typeof o === "string") {
    const low = o.toLowerCase();
    if (low === "yes") return 0;
    if (low === "no") {
      if (outcomes.length !== 2) throw new Error("Invalid outcome index");
      return 1;
    }
    const byLabel = outcomes.findIndex((l) => l.toLowerCase() === low);
    if (byLabel >= 0) return byLabel;
    const asNum = Number(o);
    if (Number.isInteger(asNum) && asNum >= 0 && asNum < outcomes.length) return asNum;
  }
  throw new Error("Outcome index is required");
}

/** Derive legacy yes/no pools for N=2 markets. */
export function binaryPoolsOf(market: Pick<Market, "outcomes" | "pools">): { yesPool: number; noPool: number } | null {
  if (market.outcomes.length !== 2 || market.pools.length !== 2) return null;
  return { yesPool: market.pools[0], noPool: market.pools[1] };
}

/** Build a Market with compat fields populated for N=2. */
export function buildMarket(base: Omit<Market, "yesPool" | "noPool" | "resolvedOutcome"> & { resolvedOutcome?: Outcome | string }): Market {
  const totalPool = base.totalPool ?? base.pools.reduce((a, b) => a + b, 0);
  let resolvedOutcome: Outcome | string | undefined = base.resolvedOutcome;
  if (resolvedOutcome === undefined && base.resolvedOutcomeIndex !== undefined) {
    if (base.outcomes.length === 2) {
      resolvedOutcome = base.resolvedOutcomeIndex === 0 ? "yes" : "no";
    } else {
      resolvedOutcome = base.outcomes[base.resolvedOutcomeIndex] ?? String(base.resolvedOutcomeIndex);
    }
  }
  const binary = binaryPoolsOf(base);
  return {
    ...base,
    totalPool,
    resolvedOutcome,
    yesPool: binary?.yesPool,
    noPool: binary?.noPool,
  };
}

/** Build a Position with compat yes/no shares for N=2. */
export function buildPosition(base: Omit<Position, "yesShares" | "noShares">): Position {
  if (base.balances.length === 2) {
    return { ...base, yesShares: base.balances[0], noShares: base.balances[1] };
  }
  return { ...base };
}
