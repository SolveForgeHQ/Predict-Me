/**
 * leaderboard.ts
 * Typed fetch helpers for the /leaderboard and /stats backend endpoints.
 */

import { apiFetch } from "./api";

// ── Types ─────────────────────────────────────────────────────

export interface LeaderboardRow {
  rank: number;
  wallet: string;
  /** Base-unit profit string — may be negative, e.g. "-50000000" */
  net_profit: string;
  token_decimals: number;
  resolved_markets: number;
  wins: number;
  win_rate: number;
}

export interface LeaderboardResponse {
  chain: string;
  season: string;
  window: { start: string; end: string } | null;
  total: number;
  limit: number;
  offset: number;
  rows: LeaderboardRow[];
}

export interface WalletStatsResponse {
  wallet: string;
  chain: string;
  season: string;
  window: { start: string; end: string } | null;
  rank: number | null;
  markets_needed: number;
  net_profit: string;
  total_stake: string;
  total_payout: string;
  token_decimals: number;
  resolved_markets: number;
  wins: number;
  win_rate: number;
}

// ── Fetch helpers ─────────────────────────────────────────────

export type LeaderboardSeason = "all" | "current";

export interface FetchLeaderboardOptions {
  chain: string;
  season: LeaderboardSeason;
  limit?: number;
  offset?: number;
  /** Override the default min_resolved_markets=5 threshold */
  minResolvedMarkets?: number;
}

export async function fetchLeaderboard(
  opts: FetchLeaderboardOptions
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({
    chain: opts.chain,
    season: opts.season,
    limit: String(opts.limit ?? 50),
    offset: String(opts.offset ?? 0),
  });
  if (opts.minResolvedMarkets !== undefined) {
    params.set("min_resolved_markets", String(opts.minResolvedMarkets));
  }
  return apiFetch<LeaderboardResponse>(`/leaderboard?${params}`);
}

export async function fetchWalletStats(
  chain: string,
  wallet: string
): Promise<WalletStatsResponse> {
  const params = new URLSearchParams({ chain });
  return apiFetch<WalletStatsResponse>(`/stats/${wallet}?${params}`);
}

// ── Formatting helpers ────────────────────────────────────────

/** Chain-specific token symbol */
export const CHAIN_SYMBOL: Record<string, string> = {
  sonic: "USDC",
  avalanche: "AVAX",
  stellar: "XLM",
};

/**
 * Formats a base-unit BigInt string to a human-readable decimal string.
 * Keeps up to 4 significant decimal places, drops trailing zeros.
 */
export function formatProfit(
  baseUnits: string,
  decimals: number,
  symbol: string
): { display: string; positive: boolean } {
  const raw = BigInt(baseUnits);
  const positive = raw >= 0n;
  const abs = positive ? raw : -raw;
  const divisor = BigInt(10 ** decimals);
  const whole = abs / divisor;
  const frac = abs % divisor;

  // Build decimal string with up to `decimals` digits, then trim
  const fracStr = frac.toString().padStart(decimals, "0");
  // Keep 4 meaningful decimal places
  const sig = Math.min(4, decimals);
  const trimmed = fracStr.slice(0, sig).replace(/0+$/, "");
  const display = trimmed
    ? `${whole}.${trimmed} ${symbol}`
    : `${whole} ${symbol}`;

  return { display: (positive ? "+" : "-") + display, positive };
}

/**
 * Truncates a wallet address for display: 0x1234...abcd (6 + 4 chars).
 */
export function truncateWallet(wallet: string): string {
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

/** Win rate as a percentage string, e.g. "74%" */
export function formatWinRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Explorer URL for an address by chain */
export function explorerUrl(chain: string, wallet: string): string {
  if (chain === "avalanche") {
    return `https://testnet.snowtrace.io/address/${wallet}`;
  }
  if (chain === "stellar") {
    return `https://stellar.expert/explorer/testnet/account/${wallet}`;
  }
  return `https://testnet.sonicscan.org/address/${wallet}`;
}

/** Sonicscan explorer URL for an address (backward compat) */
export function sonicExplorerUrl(wallet: string): string {
  return `https://testnet.sonicscan.org/address/${wallet}`;
}
