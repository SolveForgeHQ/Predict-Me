import type {
  Market,
  Position,
  CreateMarketParams,
  BuySharesParams,
  ResolveMarketParams,
  ClaimWinningsParams,
  TransactionResult,
} from "@predict-me/types";

/**
 * Chain-agnostic interface for interacting with prediction market smart contracts across
 * different blockchains (e.g., Stellar Soroban, Avalanche C-Chain / EVM).
 */
export interface PredictionMarketClient {
  /**
   * Creates a new prediction market on-chain.
   * @param params Market creation parameters (question, endTime, category, callerAddress)
   * @returns TransactionResult containing the transaction hash and the newly created marketId if available.
   */
  createMarket(params: CreateMarketParams): Promise<TransactionResult<string>>;

  /**
   * Purchases shares on one outcome of a market (N >= 2; binary YES/NO is N=2).
   * @param params Share purchase parameters (marketId, outcomeIndex | outcome, amount in base token units)
   * @returns TransactionResult containing the transaction hash.
   */
  buyShares(params: BuySharesParams): Promise<TransactionResult<void>>;

  /**
   * Resolves a market to its winning outcome index.
   * @param params Resolution parameters (marketId, winningOutcomeIndex | outcome)
   * @returns TransactionResult containing the transaction hash.
   */
  resolveMarket(params: ResolveMarketParams): Promise<TransactionResult<void>>;

  /**
   * Claims pro-rata payout winnings on a resolved market.
   * @param params Claim parameters (marketId, callerAddress)
   * @returns TransactionResult containing the transaction hash and the claimed payout amount.
   */
  claimWinnings(params: ClaimWinningsParams): Promise<TransactionResult<number>>;

  /**
   * Fetches the current state of a market.
   * @param marketId Market identifier
   * @returns Market object or null if not found.
   */
  getMarket(marketId: string): Promise<Market | null>;

  /**
   * Fetches the user's per-outcome share balances in a market.
   * @param marketId Market identifier
   * @param userAddress The user's public key or wallet address
   * @returns Position object with balances[], or null if query fails.
   */
  getPosition(marketId: string, userAddress: string): Promise<Position | null>;

  /**
   * Fetches the contract owner or admin address, if supported.
   * @returns Address string or null
   */
  getOwner?(): Promise<string | null>;
}
