/**
 * lib/feed.ts
 * Typed fetch helpers for GET /feed
 */

import { apiFetch } from "./api";
import { CHAIN_SYMBOL } from "./leaderboard";

export type FeedEventType =
  | "MarketCreated"
  | "SharesBought"
  | "MarketResolved"
  | "MarketCancelled"
  | "WinningsClaimed"
  | "Refunded";

export interface FeedItem {
  type:           FeedEventType;
  wallet:         string | null;
  market_id:      string;
  question:       string;
  outcome_label:  string | null;
  amount:         string | null;
  token_decimals: number;
  timestamp:      number;
  tx_hash:        string;
  cursor:         string;
}

export interface FeedResponse {
  chain:       string;
  items:       FeedItem[];
  next_cursor: string | null;
  has_more:    boolean;
}

export interface FetchFeedOptions {
  chain:      string;
  limit?:     number;
  cursor?:    string;
  market_id?: string;
}

export async function fetchFeed(opts: FetchFeedOptions): Promise<FeedResponse> {
  const params = new URLSearchParams({ chain: opts.chain });
  if (opts.limit)     params.set("limit",     String(opts.limit));
  if (opts.cursor)    params.set("cursor",    opts.cursor);
  if (opts.market_id) params.set("market_id", opts.market_id);
  return apiFetch<FeedResponse>(`/feed?${params}`);
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatAmount(
  amount: string | null,
  decimals: number,
  chain: string
): string | null {
  if (!amount || amount === "0") return null;
  const symbol = CHAIN_SYMBOL[chain] ?? "TOKEN";
  try {
    const raw = BigInt(amount);
    if (raw === 0n) return null;
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const frac  = raw % divisor;
    const fracStr = frac.toString().padStart(decimals, "0");
    const sig = Math.min(4, decimals);
    const trimmed = fracStr.slice(0, sig).replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed} ${symbol}` : `${whole} ${symbol}`;
  } catch {
    return null;
  }
}

export function relativeTime(timestampSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestampSec;
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function txExplorerUrl(chain: string, txHash: string): string {
  if (chain === "avalanche") return `https://testnet.snowtrace.io/tx/${txHash}`;
  if (chain === "sonic")     return `https://testnet.sonicscan.org/tx/${txHash}`;
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

export function feedSentence(item: FeedItem, chain: string): string {
  const outcome = item.outcome_label ? ` on ${item.outcome_label}` : "";
  const amt     = item.amount ? formatAmount(item.amount, item.token_decimals, chain) : null;
  const amtStr  = amt ? ` ${amt}` : "";

  switch (item.type) {
    case "MarketCreated":    return `created market`;
    case "SharesBought":     return `bought${amtStr} shares${outcome}`;
    case "MarketResolved":   return `market resolved${outcome ? ` → ${item.outcome_label}` : ""}`;
    case "MarketCancelled":  return `market cancelled`;
    case "WinningsClaimed":  return `claimed${amtStr} winnings`;
    case "Refunded":         return `refunded${amtStr}`;
    default:                 return item.type;
  }
}

// Re-export so feed components don't need two imports
export { CHAIN_SYMBOL };
