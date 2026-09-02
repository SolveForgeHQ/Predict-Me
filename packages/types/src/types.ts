export type MarketStatus = "open" | "closed" | "resolved";
export type Outcome = "yes" | "no";

export interface Market {
  id: string;
  question: string;
  endTime: number; // Unix timestamp (ms)
  status: MarketStatus;
  yesPool: number;
  noPool: number;
  resolvedOutcome?: Outcome;
}

export interface Position {
  userId: string;
  marketId: string;
  yesShares: number;
  noShares: number;
}

export interface User {
  walletAddress: string;
  handle: string | null;
  avatar: string | null;
  totalPoints: number;
}
