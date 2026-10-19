import {
  defineChain,
  type Chain,
} from "viem";
import {
  type PublicClient,
  type WalletClient,
  type Address,
  parseUnits,
  formatUnits,
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
import { PredictionMarketERC20Abi } from "./abi/PredictionMarketERC20Abi";

// ── Sonic Testnet chain definition ──────────────────────────────

export const sonicTestnet: Chain = defineChain({
  id: 14601,
  name: "Sonic Testnet",
  nativeCurrency: {
    name: "Sonic",
    symbol: "S",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.soniclabs.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "SonicScan",
      url: "https://testnet.sonicscan.org",
    },
  },
  testnet: true,
});

// ── Minimal ERC-20 ABI for token reads ──────────────────────────

const ERC20_ABI = [
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// ── Config & Client ─────────────────────────────────────────────

export interface SonicMarketClientConfig {
  contractAddress: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  defaultAccount?: Address;
}

export class SonicMarketClient implements PredictionMarketClient {
  private readonly contractAddress: Address;
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly defaultAccount?: Address;
  private _decimals: number | null = null;

  constructor(config: SonicMarketClientConfig) {
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
        "Sonic contract address is not configured. Please set NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS in .env.local"
      );
    }
  }

  private getAccount(callerAddress?: string): Address {
    const account =
      (callerAddress as Address) ??
      this.defaultAccount ??
      this.walletClient?.account?.address;
    if (!account) {
      throw new Error(
        "Caller address / account is required for Sonic transactions. Please connect your wallet."
      );
    }
    return account;
  }

  private parseMarketId(marketId: string): bigint {
    try {
      return BigInt(marketId);
    } catch {
      throw new Error(
        `Invalid market ID "${marketId}". A numeric market ID is required on Sonic.`
      );
    }
  }

  // ── Token helpers ──────────────────────────────────────────────

  /**
   * Reads the ERC-20 token's symbol and decimals from the token contract.
   * Caches decimals for subsequent parseUnits/formatUnits calls.
   */
  async getTokenInfo(): Promise<{ symbol: string; decimals: number }> {
    this.assertConfigured();
    const tokenAddress = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "token",
    });
    const [symbol, decimals] = await Promise.all([
      this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: "symbol",
      }),
      this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: "decimals",
      }),
    ]);
    this._decimals = Number(decimals);
    return { symbol: symbol as string, decimals: Number(decimals) };
  }

  private async getDecimals(): Promise<number> {
    if (this._decimals !== null) return this._decimals;
    const { decimals } = await this.getTokenInfo();
    return decimals;
  }

  /**
   * Reads the current allowance the user has granted to the market contract.
   */
  async getAllowance(userAddress: string): Promise<bigint> {
    this.assertConfigured();
    const tokenAddress = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "token",
    })) as Address;
    const allowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [userAddress as Address, this.contractAddress],
    });
    return allowance as bigint;
  }

  /**
   * Approves the market contract to spend `amount` tokens on behalf of the user.
   * Must be called before buyShares if allowance is insufficient.
   */
  async approve(
    amount: string,
    callerAddress?: string
  ): Promise<TransactionResult<void>> {
    this.assertConfigured();
    if (!this.walletClient) {
      throw new Error("WalletClient is required to approve tokens on Sonic.");
    }
    const account = this.getAccount(callerAddress);
    const decimals = await this.getDecimals();
    const amountBigInt = parseUnits(amount, decimals);
    const tokenAddress = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "token",
    })) as Address;

    const txHash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [this.contractAddress, amountBigInt],
      account,
      chain: this.walletClient.chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  // ── PredictionMarketClient implementation ──────────────────────

  async createMarket(
    params: CreateMarketParams
  ): Promise<TransactionResult<string>> {
    this.assertConfigured();
    if (!this.walletClient) {
      throw new Error(
        "WalletClient is required to create a market on Sonic. Please connect your wallet."
      );
    }
    const account = this.getAccount(params.callerAddress);
    const outcomes = normalizeOutcomes(params.outcomes);
    validateOutcomes(outcomes);
    const endTimestampSeconds = BigInt(
      params.endTime > 1_000_000_000_000
        ? Math.floor(params.endTime / 1000)
        : params.endTime
    );
    const criteria = params.resolutionCriteria ?? "Manual resolution by owner";

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "createMarket",
      args: [params.question, outcomes, endTimestampSeconds, criteria],
      account,
      chain: this.walletClient.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    let marketId: string | undefined;
    try {
      const logs = parseEventLogs({
        abi: PredictionMarketERC20Abi,
        logs: receipt.logs,
        eventName: "MarketCreated",
      });
      if (logs.length > 0 && (logs[0] as any).args?.marketId !== undefined) {
        marketId = (logs[0] as any).args.marketId.toString();
      }
    } catch {
      // Non-critical
    }
    return { txHash, data: marketId };
  }

  async buyShares(params: BuySharesParams): Promise<TransactionResult<void>> {
    this.assertConfigured();
    if (!this.walletClient) {
      throw new Error(
        "WalletClient is required to buy shares on Sonic. Please connect your wallet."
      );
    }
    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = this.parseMarketId(params.marketId);
    const decimals = await this.getDecimals();
    const amountBigInt = parseUnits(params.amount.toString(), decimals);

    if (amountBigInt <= BigInt(0)) {
      throw new Error("Amount must be greater than 0.");
    }

    // Resolve outcome index
    let outcomeIndex: number;
    if (params.outcomeIndex !== undefined) {
      outcomeIndex = params.outcomeIndex;
    } else if (typeof params.outcome === "number") {
      outcomeIndex = params.outcome;
    } else if (typeof params.outcome === "string") {
      const low = params.outcome.toLowerCase();
      if (low === "yes") outcomeIndex = 0;
      else if (low === "no") outcomeIndex = 1;
      else {
        const market = await this.getMarket(params.marketId);
        const idx = (market?.outcomes ?? []).findIndex(
          (l) => l.toLowerCase() === low
        );
        if (idx >= 0) outcomeIndex = idx;
        else outcomeIndex = Number(params.outcome);
      }
    } else {
      throw new Error("Outcome index is required");
    }

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "buyShares",
      args: [marketIdBigInt, BigInt(outcomeIndex), amountBigInt],
      account,
      chain: this.walletClient.chain,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async resolveMarket(
    params: ResolveMarketParams
  ): Promise<TransactionResult<void>> {
    this.assertConfigured();
    if (!this.walletClient) {
      throw new Error(
        "WalletClient is required to resolve a market on Sonic. Please connect your wallet."
      );
    }
    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = this.parseMarketId(params.marketId);

    let winningIndex: number;
    if (params.winningOutcomeIndex !== undefined) {
      winningIndex = params.winningOutcomeIndex;
    } else if (typeof params.outcome === "number") {
      winningIndex = params.outcome;
    } else if (typeof params.outcome === "string") {
      const low = params.outcome.toLowerCase();
      if (low === "yes") winningIndex = 0;
      else if (low === "no") winningIndex = 1;
      else {
        const market = await this.getMarket(params.marketId);
        const idx = (market?.outcomes ?? []).findIndex(
          (l) => l.toLowerCase() === low
        );
        if (idx >= 0) winningIndex = idx;
        else winningIndex = Number(params.outcome);
      }
    } else {
      throw new Error("Winning outcome index is required");
    }

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "resolveMarket",
      args: [marketIdBigInt, BigInt(winningIndex)],
      account,
      chain: this.walletClient.chain,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async cancelMarket(marketId: string): Promise<TransactionResult<void>> {
    this.assertConfigured();
    if (!this.walletClient) {
      throw new Error("WalletClient is required to cancel a market on Sonic.");
    }
    const account = this.getAccount();
    const marketIdBigInt = this.parseMarketId(marketId);

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "cancelMarket",
      args: [marketIdBigInt],
      account,
      chain: this.walletClient.chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async cancelUnresolved(marketId: string): Promise<TransactionResult<void>> {
    this.assertConfigured();
    if (!this.walletClient) {
      throw new Error(
        "WalletClient is required to cancel an unresolved market on Sonic."
      );
    }
    const account = this.getAccount();
    const marketIdBigInt = this.parseMarketId(marketId);

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "cancelUnresolved",
      args: [marketIdBigInt],
      account,
      chain: this.walletClient.chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async claimWinnings(
    params: ClaimWinningsParams
  ): Promise<TransactionResult<number>> {
    this.assertConfigured();
    if (!this.walletClient) {
      throw new Error(
        "WalletClient is required to claim winnings on Sonic."
      );
    }
    const account = this.getAccount(params.callerAddress);
    const marketIdBigInt = this.parseMarketId(params.marketId);
    const decimals = await this.getDecimals();

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "claimWinnings",
      args: [marketIdBigInt],
      account,
      chain: this.walletClient.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    let payoutAmount = 0;
    try {
      const logs = parseEventLogs({
        abi: PredictionMarketERC20Abi,
        logs: receipt.logs,
        eventName: "WinningsClaimed",
      });
      if (logs.length > 0 && (logs[0] as any).args?.payout !== undefined) {
        payoutAmount = Number(
          formatUnits((logs[0] as any).args.payout, decimals)
        );
      }
    } catch {
      // Non-critical
    }
    return { txHash, data: payoutAmount };
  }

  async refund(marketId: string): Promise<TransactionResult<number>> {
    this.assertConfigured();
    if (!this.walletClient) {
      throw new Error("WalletClient is required to refund on Sonic.");
    }
    const account = this.getAccount();
    const marketIdBigInt = this.parseMarketId(marketId);
    const decimals = await this.getDecimals();

    const txHash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: PredictionMarketERC20Abi,
      functionName: "refund",
      args: [marketIdBigInt],
      account,
      chain: this.walletClient.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    let refundAmount = 0;
    try {
      const logs = parseEventLogs({
        abi: PredictionMarketERC20Abi,
        logs: receipt.logs,
        eventName: "Refunded",
      });
      if (logs.length > 0 && (logs[0] as any).args?.amount !== undefined) {
        refundAmount = Number(
          formatUnits((logs[0] as any).args.amount, decimals)
        );
      }
    } catch {
      // Non-critical
    }
    return { txHash, data: refundAmount };
  }

  async getMarket(marketId: string): Promise<Market | null> {
    try {
      const marketIdBigInt = BigInt(marketId);
      const data = (await this.publicClient.readContract({
        address: this.contractAddress,
        abi: PredictionMarketERC20Abi,
        functionName: "getMarket",
        args: [marketIdBigInt],
      })) as any;

      if (!data) return null;

      const rawStatus = Number(data.status);
      const decimals = await this.getDecimals();
      const outcomes = [...(data.outcomeLabels as string[])];
      const pools = (data.pools as bigint[]).map((p) =>
        Number(formatUnits(p, decimals))
      );
      const totalPool = Number(formatUnits(data.totalPool, decimals));
      const endTime = Number(data.closeTime) * 1000;

      let status: MarketStatus;
      let resolvedOutcomeIndex: number | undefined;

      // 0 = Open, 1 = Resolved, 2 = Cancelled
      if (rawStatus === 0) {
        status = "open";
      } else if (rawStatus === 1) {
        status = "resolved";
        resolvedOutcomeIndex = Number(data.winningOutcome);
      } else {
        status = "cancelled";
      }

      return buildMarket({
        id: marketId,
        question: data.question,
        category: "General",
        endTime,
        status,
        outcomes: outcomes.length > 0 ? outcomes : ["YES", "NO"],
        pools,
        totalPool,
        resolvedOutcomeIndex,
        resolutionCriteria: data.resolutionCriteria || undefined,
      });
    } catch {
      return null;
    }
  }

  async getPosition(
    marketId: string,
    userAddress: string
  ): Promise<Position | null> {
    try {
      const marketIdBigInt = BigInt(marketId);
      const decimals = await this.getDecimals();
      const balancesBig = (await this.publicClient.readContract({
        address: this.contractAddress,
        abi: PredictionMarketERC20Abi,
        functionName: "getPosition",
        args: [marketIdBigInt, userAddress as Address],
      })) as readonly bigint[];

      const balances = [...balancesBig].map((b) =>
        Number(formatUnits(b, decimals))
      );

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
        abi: PredictionMarketERC20Abi,
        functionName: "owner",
      });
      return (owner as string) || null;
    } catch {
      return null;
    }
  }

  async getMarketCount(): Promise<number> {
    try {
      const count = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: PredictionMarketERC20Abi,
        functionName: "marketCount",
      });
      return Number(count);
    } catch {
      return 0;
    }
  }
}
