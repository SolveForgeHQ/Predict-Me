import type { MarketStatus } from "@/lib/types";

export type { MarketStatus };
export type { Market } from "@/lib/types";

import type { Market } from "@/lib/types";

function withPercents(
  base: Omit<Market, "outcomePercents" | "yesPercent" | "noPercent"> & {
    outcomePercents?: number[];
    yesPercent?: number;
    noPercent?: number;
  },
): Market {
  const n = base.outcomes.length;
  let outcomePercents = base.outcomePercents ?? [];
  if (outcomePercents.length !== n) {
    const pools = base.outcomePools ?? [];
    const total = pools.reduce((a, b) => a + b, 0);
    if (total > 0 && pools.length === n) {
      outcomePercents = pools.map((p) => Math.round((p / total) * 100));
      // Fix rounding drift on last element
      const drift = 100 - outcomePercents.reduce((a, b) => a + b, 0);
      outcomePercents[n - 1] += drift;
    } else {
      outcomePercents = Array.from({ length: n }, () => Math.round(100 / n));
      outcomePercents[n - 1] += 100 - outcomePercents.reduce((a, b) => a + b, 0);
    }
  }
  const yesPercent = base.yesPercent ?? (n === 2 ? outcomePercents[0] : Math.round(100 / n));
  const noPercent = base.noPercent ?? (n === 2 ? outcomePercents[1] : 0);
  return { ...base, outcomePercents, yesPercent, noPercent };
}

function mk(
  id: string,
  question: string,
  outcomes: string[],
  pools: number[],
  endsAt: string,
  status: MarketStatus,
  category: string,
  resolvedOutcomeIndex?: number,
): Market {
  const totalPool = pools.reduce((a, b) => a + b, 0);
  return withPercents({
    id,
    question,
    outcomes,
    outcomePools: pools,
    totalPool,
    endsAt,
    status,
    category,
    resolvedOutcomeIndex,
  });
}

export const MARKETS: Market[] = [
  mk("1", "Will Nigeria qualify for AFCON 2027?", ["YES", "NO"], [34920, 13580], "2026-11-15T23:59:00Z", "open", "Sports"),
  mk("2", "Will Bitcoin reach $150k before the end of 2026?", ["YES", "NO"], [87330, 125670], "2026-12-31T23:59:00Z", "open", "Crypto"),
  mk("3", "Will the US Federal Reserve cut rates in September 2026?", ["YES", "NO"], [61236, 35964], "2026-09-20T23:59:00Z", "open", "Finance"),
  mk("4", "Will OpenAI release GPT-5 before December 2026?", ["YES", "NO"], [74112, 60638], "2026-11-30T23:59:00Z", "open", "Tech"),
  mk("5", "Will Real Madrid win the 2026/27 UEFA Champions League?", ["YES", "NO"], [90016, 220384], "2027-05-30T23:59:00Z", "open", "Sports"),
  mk("6", "Will Ethereum flip Bitcoin in market cap by end of 2027?", ["YES", "NO"], [15948, 72652], "2027-12-31T23:59:00Z", "open", "Crypto"),
  mk("7", "Who will win the 2026 election?", ["Alice", "Bob", "Carol", "Dave"], [25000, 30000, 20000, 25000], "2026-11-05T23:59:00Z", "open", "Politics"),
];

export function getMarket(id: string): Market | undefined {
  return MARKETS.find((m) => m.id === id);
}

export function formatPool(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount}`;
}

export function timeRemaining(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m remaining`;
}

export interface MarketLoadResult {
  markets: Market[];
  source: "backend" | "chain" | "fallback";
}

/** Map a backend/cached market (new outcomes+pools or legacy yes/no) to frontend Market. */
export function mapBackendMarket(m: any): Market {
  const outcomes: string[] = Array.isArray(m.outcomes) && m.outcomes.length >= 2
    ? m.outcomes.map(String)
    : ["YES", "NO"];
  let pools: number[] | undefined;
  if (Array.isArray(m.pools) && m.pools.length === outcomes.length) {
    pools = m.pools.map(Number);
  } else if (m.yesPool !== undefined || m.noPool !== undefined) {
    const yesPool = Number(m.yesPool ?? 0);
    const noPool = Number(m.noPool ?? 0);
    pools = outcomes.length === 2 ? [yesPool, noPool] : [...Array(outcomes.length).fill(0)];
    if (outcomes.length === 2) pools = [yesPool, noPool];
  }
  const total = pools ? pools.reduce((a, b) => a + b, 0) : Number(m.totalPool ?? 0);
  let status: MarketStatus = "open";
  let resolvedOutcomeIndex: number | undefined = typeof m.resolvedOutcomeIndex === "number" ? m.resolvedOutcomeIndex : undefined;
  if (m.status === "resolved" || m.status === "resolved_yes" || m.status === "resolved_no") {
    if (resolvedOutcomeIndex === undefined) {
      if (m.status === "resolved_yes") resolvedOutcomeIndex = 0;
      else if (m.status === "resolved_no") resolvedOutcomeIndex = 1;
      else if (m.resolvedOutcome === "yes" || m.resolvedOutcome === "YES") resolvedOutcomeIndex = 0;
      else if (m.resolvedOutcome === "no" || m.resolvedOutcome === "NO") resolvedOutcomeIndex = 1;
      else if (typeof m.resolvedOutcome === "string") {
        const idx = outcomes.findIndex((o) => o.toLowerCase() === String(m.resolvedOutcome).toLowerCase());
        resolvedOutcomeIndex = idx >= 0 ? idx : 0;
      } else resolvedOutcomeIndex = 0;
    }
    status = outcomes.length === 2
      ? (resolvedOutcomeIndex === 0 ? "resolved_yes" : "resolved_no")
      : "resolved";
  }
  return withPercents({
    id: String(m.id),
    chain: undefined,
    question: String(m.question),
    outcomes,
    outcomePools: pools,
    totalPool: total,
    endsAt: typeof m.endTime === "number" ? new Date(m.endTime).toISOString() : String(m.endTime ?? new Date().toISOString()),
    status,
    category: String(m.category ?? "General"),
    resolvedOutcomeIndex,
    ...(m.chain ? { chain: String(m.chain) } : {}),
  } as any);
}

/**
 * Loads all markets and reports data source (backend, direct chain, or fallback).
 */
export async function loadMarketsWithSource(chain?: string): Promise<MarketLoadResult> {
  // 1. Primary: Backend GET /markets (chain-aware)
  try {
    const { apiFetch } = await import("@/lib/api");
    const path = chain ? `/markets?chain=${encodeURIComponent(chain)}` : "/markets";
    const data = await apiFetch<{ markets?: any[] }>(path);
    if (data && Array.isArray(data.markets) && data.markets.length > 0) {
      return { markets: data.markets.map(mapBackendMarket), source: "backend" };
    }
  } catch (err) {
    console.warn("Backend GET /markets failed, falling back to direct chain call:", err);
  }

  // 2. Secondary: Read directly from the Stellar contract (legacy fallback)
  if (!chain || chain === "stellar") {
    try {
      const { fetchMarkets } = await import("@/lib/contract");
      const onChainMarkets = await fetchMarkets();
      if (onChainMarkets && onChainMarkets.length > 0) {
        return { markets: onChainMarkets, source: "chain" };
      }
    } catch (chainErr) {
      console.warn("Direct contract fetch failed:", chainErr);
    }
  }

  // 3. Return empty
  return { markets: [], source: "fallback" };
}

/**
 * Loads all markets:
 * 1. Primary: Fetches from backend GET /markets (cached on edge)
 * 2. Fallback: Directly fetches on-chain from Soroban contract RPC
 * 3. Default: Returns initial baseline markets
 */
export async function loadAllMarkets(chain?: string): Promise<Market[]> {
  const result = await loadMarketsWithSource(chain);
  return result.markets;
}
