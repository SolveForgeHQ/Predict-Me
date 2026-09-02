// mockData.ts
// Static placeholder market data used while the Soroban contract is not yet
// deployed. Import MOCK_MARKETS anywhere you need data before contract calls
// are wired up. When lib/contract.ts is ready, replace usages of MOCK_MARKETS
// with the real fetchMarkets() call.

import { Market } from "@/lib/types";

export const MOCK_MARKETS: Market[] = [
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

export function getMockMarket(id: string): Market | undefined {
  return MOCK_MARKETS.find((m) => m.id === id);
}
