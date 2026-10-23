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
import {
  normalizeOutcomes,
  validateOutcomes,
  buildMarket,
  buildPosition,
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
    // New contract uses closeTime as uint64 (seconds)
    const closeTimestampSeconds = BigInt(
      params.endTime > 1_000_000_000_000
        ? Math.floor(params.endTime / 1000)
        : params.endTime
    );
    const outcomes = normalizeOutcomes(params.outcomes);
    validateOutcomes(outcomes);
    const resolutionCriteria = params.resolutionCriteria ?? "Owner decides";

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketAbi,
      functionName: "createMarket",
      args: [params.question, outcomes, closeTimestampSeconds, resolutionCriteria],
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

  private resolveLocalOutcomeIndex(params: {
    outcomeIndex?: number;
    outcome?: string | number;
  }): number | null {
    if (params.outcomeIndex !== undefined) return params.outcomeIndex;
    const o = params.outcome;
    if (typeof o === "number" && Number.isInteger(o) && o >= 0) return o;
    if (typeof o === "string") {
      const low = o.toLowerCase();
      if (low === "yes") return 0;
      if (low === "no") return 1;
      const asNum = Number(o);
      if (Number.isInteger(asNum) && asNum >= 0) return asNum;
    }
    return null;
  }

  private async resolveOutcomeIndex(
    params: { outcomeIndex?: number; outcome?: string | number },
    marketId: string,
  ): Promise<number> {
    const fast = this.resolveLocalOutcomeIndex(params);
    if (fast !== null) return fast;
    const market = await this.getMarket(marketId);
    const outcomes = market?.outcomes ?? ["YES", "NO"];
    const o = params.outcome;
    if (typeof o === "string") {
      const idx = outcomes.findIndex((l) => l.toLowerCase() === o.toLowerCase());
      if (idx >= 0) return idx;
    }
    throw new Error("Outcome index is required");
  }

  async buyShares(params: BuySharesParams): Promise<TransactionResult<void>> {
    this.assertConfigured();

    if (!this.walletClient) {
      throw new Error("WalletClient is required to buy shares on Avalanche. Please connect your wallet.");
    }

    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = this.parseMarketId(params.marketId);
    const outcomeIndex = await this.resolveOutcomeIndex(params, params.marketId);
    const valueWei = parseEther(params.amount.toString());

    if (valueWei <= BigInt(0)) {
      throw new Error("Amount must be greater than 0 AVAX.");
    }

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketAbi,
      functionName: "buyShares",
      args: [marketIdBigInt, BigInt(outcomeIndex)],
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
    const outcomeIndex = await this.resolveOutcomeIndex(params, params.marketId);

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketAbi,
      functionName: "resolveMarket",
      args: [marketIdBigInt, BigInt(outcomeIndex)],
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

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    let payoutAmount = 0;
    try {
      const logs = parseEventLogs({
        abi: PredictionMarketAbi,
        logs: receipt.logs,
        eventName: "WinningsClaimed",
      });
      if (logs.length > 0 && (logs[0] as any).args?.payout !== undefined) {
        payoutAmount = Number(formatEther((logs[0] as any).args.payout));
      }
    } catch {
      // Non-critical if log parsing fails
    }

    return { txHash, data: payoutAmount };
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

      const rawStatus = Number((data as any).status);
      // 0=Open, 1=Resolved, 2=Cancelled
      const status: MarketStatus = rawStatus === 0 ? "open" : rawStatus === 1 ? "resolved" : "cancelled";
      const outcomes = [...((data as any).outcomeLabels as string[])];
      const pools = ((data as any).pools as bigint[]).map((p) => Number(formatEther(p)));
      const totalPool = Number(formatEther((data as any).totalPool));
      // New contract uses closeTime (uint64) instead of endTime (uint256)
      const endTime = Number((data as any).closeTime ?? (data as any).endTime) * 1000;
      const resolvedOutcomeIndex = rawStatus === 1 ? Number((data as any).winningOutcome) : undefined;

      return buildMarket({
        id: marketId,
        question: (data as any).question,
        category: "General",
        endTime,
        status,
        outcomes: outcomes.length > 0 ? outcomes : ["YES", "NO"],
        pools,
        totalPool,
        resolvedOutcomeIndex,
        resolutionCriteria: (data as any).resolutionCriteria || undefined,
      });
    } catch {
      return null;
    }
  }

  async getPosition(marketId: string, userAddress: string): Promise<Position | null> {
    try {
      const marketIdBigInt = BigInt(marketId);
      const user = userAddress as Address;

      const balancesBig = (await this.publicClient.readContract({
        address: this.contractAddress,
        abi: PredictionMarketAbi,
        functionName: "getPosition",
        args: [marketIdBigInt, user],
      })) as bigint[] | readonly bigint[];

      // Legacy fallback: old getPosition returned (yesBalance, noBalance) tuple
      let balances: number[];
      if (Array.isArray(balancesBig)) {
        balances = [...balancesBig].map((b) => Number(formatEther(b)));
      } else {
        const tuple = balancesBig as unknown as { yesBalance: bigint; noBalance: bigint };
        balances = [Number(formatEther(tuple.yesBalance)), Number(formatEther(tuple.noBalance))];
      }

      return buildPosition({
        userId: userAddress,
        marketId,
        balances,
        avgYesPrice: null,
        avgNoPrice: null,
      });
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
