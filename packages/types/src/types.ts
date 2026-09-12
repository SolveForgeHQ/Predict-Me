export type MarketStatus = "open" | "closed" | "resolved";
export type Outcome = "yes" | "no";

export interface Market {
  id: string;
  question: string;
  category?: string;
  endTime: number; // Unix timestamp (ms)
  status: MarketStatus;
  yesPool: number;
  noPool: number;
  totalPool?: number;
  resolvedOutcome?: Outcome;
}

export interface Position {
  userId: string;
  marketId: string;
  yesShares: number;
  noShares: number;
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
  callerAddress?: string;
}

export interface BuySharesParams {
  marketId: string;
  outcome: Outcome;
  amount: number; // In token units (e.g. XLM or AVAX)
  callerAddress?: string;
}

export interface ResolveMarketParams {
  marketId: string;
  outcome: Outcome;
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
