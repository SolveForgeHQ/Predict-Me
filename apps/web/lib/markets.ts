export type MarketStatus = "open" | "resolved_yes" | "resolved_no";

export interface Market {
  id: string;
  question: string;
  yesPercent: number;
  noPercent: number;
  totalPool: number;
  endsAt: string; // ISO date string
  status: MarketStatus;
  category: string;
}

export const MARKETS: Market[] = [
  {
    id: "1",
    question: "Will Nigeria qualify for AFCON 2027?",
    yesPercent: 72,
    noPercent: 28,
    totalPool: 48500,
    endsAt: "2026-11-15T23:59:00Z",
    status: "open",
    category: "Sports",
  },
  {
    id: "2",
    question: "Will Bitcoin reach $150k before the end of 2026?",
    yesPercent: 41,
    noPercent: 59,
    totalPool: 213000,
    endsAt: "2026-12-31T23:59:00Z",
    status: "open",
    category: "Crypto",
  },
  {
    id: "3",
    question: "Will the US Federal Reserve cut rates in September 2026?",
    yesPercent: 63,
    noPercent: 37,
    totalPool: 97200,
    endsAt: "2026-09-20T23:59:00Z",
    status: "open",
    category: "Finance",
  },
  {
    id: "4",
    question: "Will OpenAI release GPT-5 before December 2026?",
    yesPercent: 55,
    noPercent: 45,
    totalPool: 134750,
    endsAt: "2026-11-30T23:59:00Z",
    status: "open",
    category: "Tech",
  },
  {
    id: "5",
    question: "Will Real Madrid win the 2026/27 UEFA Champions League?",
    yesPercent: 29,
    noPercent: 71,
    totalPool: 310400,
    endsAt: "2027-05-30T23:59:00Z",
    status: "open",
    category: "Sports",
  },
  {
    id: "6",
    question: "Will Ethereum flip Bitcoin in market cap by end of 2027?",
    yesPercent: 18,
    noPercent: 82,
    totalPool: 88600,
    endsAt: "2027-12-31T23:59:00Z",
    status: "open",
    category: "Crypto",
  },
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

/**
 * Loads all markets:
 * 1. Primary: Fetches from backend GET /markets (cached on edge)
 * 2. Fallback: Directly fetches on-chain from Soroban contract RPC
 * 3. Default: Returns initial baseline markets
 */
export async function loadAllMarkets(): Promise<Market[]> {
  // 1. Primary: Backend GET /markets
  try {
    const { apiFetch } = await import("@/lib/api");
    const data = await apiFetch<{ markets?: any[] }>("/markets");
    if (data && Array.isArray(data.markets) && data.markets.length > 0) {
      return data.markets.map((m) => {
        const yesPool = Number(m.yesPool ?? 0);
        const noPool = Number(m.noPool ?? 0);
        const total = yesPool + noPool;
        const yesPercent = total > 0 ? Math.round((yesPool / total) * 100) : 50;
        const noPercent = total > 0 ? 100 - yesPercent : 50;
        const status: MarketStatus =
          m.status === "open"
            ? "open"
            : m.resolvedOutcome === "no"
            ? "resolved_no"
            : "resolved_yes";

        return {
          id: String(m.id),
          question: String(m.question),
          category: String(m.category ?? "General"),
          yesPercent,
          noPercent,
          totalPool: total,
          endsAt: typeof m.endTime === "number" ? new Date(m.endTime).toISOString() : String(m.endTime),
          status,
        };
      });
    }
  } catch (err) {
    console.warn("Backend GET /markets failed, falling back to direct contract call:", err);
  }

  // 2. Secondary fallback: Query Soroban contract directly
  try {
    const { fetchMarkets } = await import("@/lib/contract");
    const onChainMarkets = await fetchMarkets();
    if (onChainMarkets && onChainMarkets.length > 0) {
      return onChainMarkets;
    }
  } catch (chainErr) {
    console.warn("Direct contract fetch failed, using fallback markets:", chainErr);
  }

  // 3. Baseline mock fallback
  return MARKETS;
}

