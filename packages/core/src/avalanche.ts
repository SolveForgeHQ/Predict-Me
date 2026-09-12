import {
  type PublicClient,
  type WalletClient,
  type Address,
  parseEther,
  formatEther,
} from "viem";
import type {
  Market,
  Position,
  MarketStatus,
  CreateMarketParams,
  BuySharesParams,
  ResolveMarketParams,
  ClaimWinningsParams,
  TransactionResult,
} from "@predict-me/types";
import type { PredictionMarketClient } from "./interface";
import { PredictionMarketAbi } from "./abi/PredictionMarketAbi";

export interface AvalancheMarketClientConfig {
  contractAddress: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  defaultAccount?: Address;
}

export class AvalancheMarketClient implements PredictionMarketClient {
  private readonly contractAddress: Address;
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly defaultAccount?: Address;

  constructor(config: AvalancheMarketClientConfig) {
    this.contractAddress = config.contractAddress;
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.defaultAccount = config.defaultAccount;
  }

  private getAccount(callerAddress?: string): Address {
    const account = (callerAddress as Address) ?? this.defaultAccount ?? this.walletClient?.account?.address;
    if (!account) {
      throw new Error("Caller address / account is required for Avalanche transaction.");
    }
    return account;
  }

  async createMarket(params: CreateMarketParams): Promise<TransactionResult<string>> {
    if (!this.walletClient) {
      throw new Error("WalletClient is required to create a market on Avalanche.");
    }

    const account = this.getAccount(params.callerAddress);
    const endTimestampSeconds = BigInt(
      params.endTime > 1_000_000_000_000
        ? Math.floor(params.endTime / 1000)
        : params.endTime
    );

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketAbi,
      functionName: "createMarket",
      args: [params.question, endTimestampSeconds],
      account,
      chain: this.walletClient.chain,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async buyShares(params: BuySharesParams): Promise<TransactionResult<void>> {
    if (!this.walletClient) {
      throw new Error("WalletClient is required to buy shares on Avalanche.");
    }

    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = BigInt(params.marketId);
    const isYes = params.outcome.toLowerCase() === "yes";
    const valueWei = parseEther(params.amount.toString());

    if (valueWei <= BigInt(0)) {
      throw new Error("Amount must be greater than 0 AVAX.");
    }

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketAbi,
      functionName: "buyShares",
      args: [marketIdBigInt, isYes],
      value: valueWei,
      account,
      chain: this.walletClient.chain,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async resolveMarket(params: ResolveMarketParams): Promise<TransactionResult<void>> {
    if (!this.walletClient) {
      throw new Error("WalletClient is required to resolve a market on Avalanche.");
    }

    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = BigInt(params.marketId);
    const outcomeBool = params.outcome.toLowerCase() === "yes";

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketAbi,
      functionName: "resolveMarket",
      args: [marketIdBigInt, outcomeBool],
      account,
      chain: this.walletClient.chain,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async claimWinnings(params: ClaimWinningsParams): Promise<TransactionResult<number>> {
    if (!this.walletClient) {
      throw new Error("WalletClient is required to claim winnings on Avalanche.");
    }

    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = BigInt(params.marketId);

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketAbi,
      functionName: "claimWinnings",
      args: [marketIdBigInt],
      account,
      chain: this.walletClient.chain,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async getMarket(marketId: string): Promise<Market | null> {
    try {
      const marketIdBigInt = BigInt(marketId);

      const data = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: PredictionMarketAbi,
        functionName: "getMarket",
        args: [marketIdBigInt],
      });

      if (!data) return null;

      const rawStatus = Number(data.status);
      const status: MarketStatus = rawStatus === 0 ? "open" : "resolved";
      const resolvedOutcome = rawStatus !== 0 ? (data.outcome ? "yes" : "no") : undefined;

      const yesPool = Number(formatEther(data.yesPool));
      const noPool = Number(formatEther(data.noPool));
      const totalPool = Number(formatEther(data.totalPool));
      const endTime = Number(data.endTime) * 1000;

      return {
        id: marketId,
        question: data.question,
        category: "General",
        endTime,
        status,
        yesPool,
        noPool,
        totalPool,
        resolvedOutcome,
      };
    } catch {
      return null;
    }
  }

  async getPosition(marketId: string, userAddress: string): Promise<Position | null> {
    try {
      const marketIdBigInt = BigInt(marketId);
      const user = userAddress as Address;

      const [yesBalance, noBalance] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: PredictionMarketAbi,
        functionName: "getPosition",
        args: [marketIdBigInt, user],
      });

      return {
        userId: userAddress,
        marketId,
        yesShares: Number(formatEther(yesBalance)),
        noShares: Number(formatEther(noBalance)),
        avgYesPrice: null,
        avgNoPrice: null,
      };
    } catch {
      return null;
    }
  }
}
