/**
 * lib/profile.ts
 * Typed fetch helpers for GET /profile/:wallet
 */

import { apiFetch } from "./api";
import { formatProfit, truncateWallet, explorerUrl, CHAIN_SYMBOL } from "./leaderboard";

export type PositionStatus = "won" | "lost" | "cancelled_refunded" | "resolved_unclaimed" | "open";

export interface ProfileHistoryEntry {
  market_id: string;
  question: string;
  outcomes: string[];
  outcome_backed: string[];
  stake: string;
  status: PositionStatus;
  payout: string;
  profit: string;
  tx_hash: string;
}

export interface ProfileOpenPosition {
  market_id: string;
  question: string;
  outcomes: string[];
  outcome_backed: string[];
  stake: string;
  tx_hash: string;
}

export interface ProfileTotals {
  total_staked: string;
  total_payout: string;
  net_profit: string;
  resolved_markets: number;
  wins: number;
  win_rate: number;
  rank: number | null;
}

export interface ProfileResponse {
  wallet: string;
  chain: string;
  token_decimals: number;
  totals: ProfileTotals;
  history: ProfileHistoryEntry[];
  open_positions: ProfileOpenPosition[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export async function fetchProfile(
  chain: string,
  wallet: string,
  limit = 20,
  offset = 0
): Promise<ProfileResponse> {
  const params = new URLSearchParams({
    chain,
    limit: String(limit),
    offset: String(offset),
  });
  return apiFetch<ProfileResponse>(`/profile/${wallet}?${params}`);
}

// ── Re-export helpers from leaderboard so profile page can use them ──────────
export { formatProfit, truncateWallet, explorerUrl, CHAIN_SYMBOL };

// ── Status display helpers ────────────────────────────────────────────────────

export const STATUS_LABEL: Record<PositionStatus, string> = {
  won:                "Won",
  lost:               "Lost",
  cancelled_refunded: "Refunded",
  resolved_unclaimed: "Unclaimed",
  open:               "Open",
};

export const STATUS_COLOR: Record<PositionStatus, string> = {
  won:                "#00D084",
  lost:               "#FF4D5E",
  cancelled_refunded: "#F59E0B",
  resolved_unclaimed: "#60A5FA",
  open:               "#8B93A7",
};

export const STATUS_BG: Record<PositionStatus, string> = {
  won:                "rgba(0,208,132,0.12)",
  lost:               "rgba(255,77,94,0.12)",
  cancelled_refunded: "rgba(245,158,11,0.12)",
  resolved_unclaimed: "rgba(96,165,250,0.12)",
  open:               "rgba(139,147,167,0.12)",
};
