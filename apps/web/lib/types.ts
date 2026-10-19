// types.ts
// Shared TypeScript types used across the frontend.
// Multi-outcome: N >= 2 outcomes per market. Binary YES/NO is the N=2 case.

// ----- Market ----------------------------------------------------------------

export type MarketStatus = "open" | "resolved" | "resolved_yes" | "resolved_no";

export interface Market {
  /** Unique identifier — on-chain this will be a u32 market_id */
  id: string;
  /** Source chain (stellar | avalanche), when known */
  chain?: string;
  /** The question being predicted */
  question: string;
  /** Canonical outcome labels, N >= 2. Binary: ["YES","NO"]. */
  outcomes: string[];
  /** Per-outcome percentages (0–100), same length as outcomes. */
  outcomePercents: number[];
  /** Per-outcome pools (optional, in display units). */
  outcomePools?: number[];
  /** Percentage of total pool on the YES side (N=2 compat). */
  yesPercent: number;
  /** Percentage of total pool on the NO side (N=2 compat). */
  noPercent: number;
  /** Total locked in the market (in base units or display dollars) */
  totalPool: number;
  /** ISO 8601 string — resolution deadline */
  endsAt: string;
  status: MarketStatus;
  /** Winning outcome index when resolved (0..N-1). */
  resolvedOutcomeIndex?: number;
  /** Display tag used for colour-coding cards */
  category: string;
}

// ----- Position --------------------------------------------------------------

export interface Position {
  /** Per-outcome share balances, same length as market outcomes. */
  balances: number[];
  /** Number of YES shares held (N=2 compat). */
  yesShares: number;
  /** Number of NO shares held (N=2 compat). */
  noShares: number;
  /** Average price paid per YES share (null if no position) */
  avgYesPrice: number | null;
  /** Average price paid per NO share (null if no position) */
  avgNoPrice: number | null;
}

// ----- Helpers ---------------------------------------------------------------

export const BINARY_OUTCOMES = ["YES", "NO"];

const OUTCOME_COLORS = ["#00D084", "#FF4D5E", "#3B82F6", "#F59E0B", "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16"];

export function outcomeColor(index: number): string {
  return OUTCOME_COLORS[index % OUTCOME_COLORS.length];
}

export function isResolvedStatus(status: MarketStatus): boolean {
  return status !== "open";
}

export function winningLabel(market: Pick<Market, "outcomes" | "resolvedOutcomeIndex" | "status">): string | null {
  if (market.resolvedOutcomeIndex !== undefined && market.outcomes[market.resolvedOutcomeIndex] !== undefined) {
    return market.outcomes[market.resolvedOutcomeIndex];
  }
  if (market.status === "resolved_yes") return market.outcomes[0] ?? "YES";
  if (market.status === "resolved_no") return market.outcomes[1] ?? "NO";
  return null;
}

// ----- Wallet ----------------------------------------------------------------

export interface WalletState {
  /** Stellar public key (G...) of the connected wallet, null if disconnected */
  publicKey: string | null;
  /** Human-readable wallet name, e.g. "Freighter" */
  walletName: string | null;
  connected: boolean;
}
