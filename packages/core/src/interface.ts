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
   * Purchases YES or NO shares in a specific market.
   * @param params Share purchase parameters (marketId, outcome, amount in base token units)
   * @returns TransactionResult containing the transaction hash.
   */
  buyShares(params: BuySharesParams): Promise<TransactionResult<void>>;

  /**
   * Resolves a market to its winning outcome.
   * @param params Resolution parameters (marketId, outcome: "yes" | "no")
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
   * Fetches the user's YES/NO share balance and position in a market.
   * @param marketId Market identifier
   * @param userAddress The user's public key or wallet address
   * @returns Position object with yesShares and noShares, or null if query fails.
   */
  getPosition(marketId: string, userAddress: string): Promise<Position | null>;
}
