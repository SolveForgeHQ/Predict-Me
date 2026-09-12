import {
  type PublicClient,
  type WalletClient,
  type Address,
  parseEther,
  formatEther,
  parseEventLogs,
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

  private assertConfigured(): void {
    if (
      !this.contractAddress ||
      this.contractAddress === "0x0000000000000000000000000000000000000000"
    ) {
      throw new Error(
        "Avalanche contract address is not configured. Please set NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS in .env.local."
      );
    }
  }

  private parseMarketId(marketId: string): bigint {
    try {
      return BigInt(marketId);
    } catch {
      throw new Error(
        `Invalid market ID "${marketId}". A numeric market ID is required on Avalanche.`
      );
    }
  }

  private getAccount(callerAddress?: string): Address {
    const account = (callerAddress as Address) ?? this.defaultAccount ?? this.walletClient?.account?.address;
    if (!account) {
      throw new Error("Caller address / account is required for Avalanche transaction. Please connect your wallet.");
    }
    return account;
  }

  async createMarket(params: CreateMarketParams): Promise<TransactionResult<string>> {
    this.assertConfigured();

    if (!this.walletClient) {
      throw new Error("WalletClient is required to create a market on Avalanche. Please connect your wallet.");
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

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    let marketId: string | undefined = undefined;
    try {
      const logs = parseEventLogs({
        abi: PredictionMarketAbi,
        logs: receipt.logs,
        eventName: "MarketCreated",
      });
      if (logs.length > 0 && (logs[0] as any).args?.marketId !== undefined) {
        marketId = (logs[0] as any).args.marketId.toString();
      }
    } catch {
      // Non-critical if event log parsing fails
    }

    return { txHash, data: marketId };
  }

  async buyShares(params: BuySharesParams): Promise<TransactionResult<void>> {
    this.assertConfigured();

    if (!this.walletClient) {
      throw new Error("WalletClient is required to buy shares on Avalanche. Please connect your wallet.");
    }

    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = this.parseMarketId(params.marketId);
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
    this.assertConfigured();

    if (!this.walletClient) {
      throw new Error("WalletClient is required to resolve a market on Avalanche. Please connect your wallet.");
    }

    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = this.parseMarketId(params.marketId);
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
    this.assertConfigured();

    if (!this.walletClient) {
      throw new Error("WalletClient is required to claim winnings on Avalanche. Please connect your wallet.");
    }

    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = this.parseMarketId(params.marketId);

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

  async getOwner(): Promise<string | null> {
    try {
      const owner = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: PredictionMarketAbi,
        functionName: "owner",
      });
      return (owner as string) || null;
    } catch (err) {
      console.warn("Could not read contract owner on Avalanche:", err);
      return null;
    }
  }
}
