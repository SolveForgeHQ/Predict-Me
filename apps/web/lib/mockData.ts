// mockData.ts
// Static placeholder market data used while the Soroban contract is not yet
// deployed. Import MOCK_MARKETS anywhere you need data before contract calls
// are wired up. When lib/contract.ts is ready, replace usages of MOCK_MARKETS
// with the real fetchMarkets() call.

import { Market } from "@/lib/types";

function mk(
  id: string,
  question: string,
  outcomes: string[],
  percents: number[],
  totalPool: number,
  endsAt: string,
  status: Market["status"],
  category: string,
): Market {
  return {
    id,
    question,
    outcomes,
    outcomePercents: percents,
    outcomePools: percents.map((p) => Math.round((totalPool * p) / 100)),
    yesPercent: outcomes.length === 2 ? percents[0] : 50,
    noPercent: outcomes.length === 2 ? percents[1] : 50,
    totalPool,
    endsAt,
    status,
    category,
  };
}

export const MOCK_MARKETS: Market[] = [
  mk("1", "Will Nigeria qualify for AFCON 2027?", ["YES", "NO"], [72, 28], 48500, "2026-11-15T23:59:00Z", "open", "Sports"),
  mk("2", "Will Bitcoin reach $150k before the end of 2026?", ["YES", "NO"], [41, 59], 213000, "2026-12-31T23:59:00Z", "open", "Crypto"),
  mk("3", "Will the US Federal Reserve cut rates in September 2026?", ["YES", "NO"], [63, 37], 97200, "2026-09-20T23:59:00Z", "open", "Finance"),
  mk("4", "Will OpenAI release GPT-5 before December 2026?", ["YES", "NO"], [55, 45], 134750, "2026-11-30T23:59:00Z", "open", "Tech"),
  mk("5", "Will Real Madrid win the 2026/27 UEFA Champions League?", ["YES", "NO"], [29, 71], 310400, "2027-05-30T23:59:00Z", "open", "Sports"),
  mk("6", "Will Ethereum flip Bitcoin in market cap by end of 2027?", ["YES", "NO"], [18, 82], 88600, "2027-12-31T23:59:00Z", "open", "Crypto"),
  mk("7", "Who will win the 2026 election?", ["Alice", "Bob", "Carol", "Dave"], [25, 30, 20, 25], 100000, "2026-11-05T23:59:00Z", "open", "Politics"),
];

export function getMockMarket(id: string): Market | undefined {
  return MOCK_MARKETS.find((m) => m.id === id);
}
