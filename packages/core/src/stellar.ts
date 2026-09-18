import {
  rpc,
  TransactionBuilder,
  Contract,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
  Account,
} from "@stellar/stellar-sdk";
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

export interface StellarMarketClientConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase?: string;
  signTransaction?: (xdrString: string) => Promise<string>;
  defaultCallerPublicKey?: string;
}

export class StellarMarketClient implements PredictionMarketClient {
  private readonly contractId: string;
  private readonly rpcUrl: string;
  private readonly networkPassphrase: string;
  private readonly signTransactionFn?: (xdrString: string) => Promise<string>;
  private readonly defaultCallerPublicKey?: string;
  private readonly server?: rpc.Server;
  private readonly contract?: Contract;

  constructor(config: StellarMarketClientConfig) {
    this.contractId = config.contractId;
    this.rpcUrl = config.rpcUrl;
    this.networkPassphrase = config.networkPassphrase ?? Networks.TESTNET;
    this.signTransactionFn = config.signTransaction;
    this.defaultCallerPublicKey = config.defaultCallerPublicKey;
    // Guard against empty rpcUrl during SSR / CI build when env vars are unset
    if (this.rpcUrl) {
      try {
        this.server = new rpc.Server(this.rpcUrl, {
          allowHttp: this.rpcUrl.startsWith("http://"),
        });
      } catch {
        // Invalid URL — will be caught at runtime when methods are called
      }
    }
    if (this.contractId) {
      try {
        this.contract = new Contract(this.contractId);
      } catch {
        // May fail during SSR / build time if contractId is not yet configured
      }
    }
  }

  private async invokeContract(
    callerPublicKey: string,
    method: string,
    args: xdr.ScVal[]
  ): Promise<string> {
    if (!this.contract || !this.contractId || !this.rpcUrl || !this.server) {
      throw new Error("Contract ID or RPC URL is not configured for StellarMarketClient.");
    }
    if (!this.signTransactionFn) {
      throw new Error("signTransaction callback is required to send transactions on Stellar.");
    }

    const accountData = await this.server.getAccount(callerPublicKey);
    const account = new Account(callerPublicKey, (accountData as any).sequence);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(60)
      .build();

    const simResult = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Stellar contract simulation failed: ${simResult.error}`);
    }

    const preparedTx = rpc.assembleTransaction(tx, simResult).build();
    const signedXdr = await this.signTransactionFn(preparedTx.toXDR());

    const submittedTx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    const sendResult = await this.server.sendTransaction(submittedTx);

    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction submission error: ${sendResult.errorResult?.toXDR("base64") ?? "unknown"}`);
    }

    const hash = sendResult.hash;
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const statusResult = await this.server.getTransaction(hash);
      if (statusResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return hash;
      }
      if (statusResult.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction ${hash} failed during execution.`);
      }
    }

    return hash;
  }

  async createMarket(params: CreateMarketParams): Promise<TransactionResult<string>> {
    const caller = params.callerAddress ?? this.defaultCallerPublicKey;
    if (!caller) {
      throw new Error("Caller address / public key is required to create a market.");
    }

    const endTimestamp = params.endTime > 1_000_000_000_000
      ? Math.floor(params.endTime / 1000)
      : params.endTime;

    const category = params.category ?? "General";
    const args: xdr.ScVal[] = [
      nativeToScVal(params.question, { type: "string" }),
      nativeToScVal(endTimestamp, { type: "u64" }),
      nativeToScVal(category, { type: "string" }),
    ];

    const txHash = await this.invokeContract(caller, "create_market", args);
    return { txHash };
  }

  async buyShares(params: BuySharesParams): Promise<TransactionResult<void>> {
    const caller = params.callerAddress ?? this.defaultCallerPublicKey;
    if (!caller) {
      throw new Error("Caller address is required to buy shares.");
    }

    const marketIdNum = parseInt(params.marketId, 10);
    const sideNum = params.outcome.toLowerCase() === "yes" ? 0 : 1;
    // 1 XLM = 10^7 stroops
    const amountStroops = BigInt(Math.round(params.amount * 10_000_000));

    if (amountStroops <= BigInt(0)) {
      throw new Error("Amount must be greater than 0 XLM.");
    }

    const args: xdr.ScVal[] = [
      nativeToScVal(marketIdNum, { type: "u32" }),
      nativeToScVal(sideNum, { type: "u32" }),
      nativeToScVal(amountStroops, { type: "i128" }),
      nativeToScVal(caller, { type: "address" }),
    ];

    const txHash = await this.invokeContract(caller, "buy_shares", args);
    return { txHash };
  }

  async resolveMarket(params: ResolveMarketParams): Promise<TransactionResult<void>> {
    const caller = params.callerAddress ?? this.defaultCallerPublicKey;
    if (!caller) {
      throw new Error("Caller address is required to resolve market.");
    }

    const marketIdNum = parseInt(params.marketId, 10);
    const outcomeNum = params.outcome.toLowerCase() === "yes" ? 0 : 1;

    const args: xdr.ScVal[] = [
      nativeToScVal(marketIdNum, { type: "u32" }),
      nativeToScVal(outcomeNum, { type: "u32" }),
    ];

    const txHash = await this.invokeContract(caller, "resolve_market", args);
    return { txHash };
  }

  async claimWinnings(params: ClaimWinningsParams): Promise<TransactionResult<number>> {
    const caller = params.callerAddress ?? this.defaultCallerPublicKey;
    if (!caller) {
      throw new Error("Caller address is required to claim winnings.");
    }

    const marketIdNum = parseInt(params.marketId, 10);
    const args: xdr.ScVal[] = [
      nativeToScVal(marketIdNum, { type: "u32" }),
      nativeToScVal(caller, { type: "address" }),
    ];

    const txHash = await this.invokeContract(caller, "claim_winnings", args);
    return { txHash };
  }

  async getMarket(marketId: string): Promise<Market | null> {
    if (!this.contract || !this.server) return null;
    try {
      const marketIdNum = parseInt(marketId, 10);
      const marketKey = xdr.ScVal.scvVec([
        nativeToScVal("Market", { type: "symbol" }),
        nativeToScVal(marketIdNum, { type: "u32" }),
      ]);

      const entry = await this.server.getContractData(
        this.contract.address(),
        marketKey,
        rpc.Durability.Persistent
      );

      if (!entry || !entry.val) return null;

      const state = scValToNative(entry.val.contractData().val());
      if (!state) return null;

      const rawStatus = Number(state.status ?? 0);
      const status: MarketStatus = rawStatus === 0 ? "open" : "resolved";
      const resolvedOutcome = rawStatus === 1 ? "yes" : rawStatus === 2 ? "no" : undefined;

      const yesPool = state.yes_pool ? Number(state.yes_pool) / 10_000_000 : 0;
      const noPool = state.no_pool ? Number(state.no_pool) / 10_000_000 : 0;
      const endTime = state.end_timestamp
        ? Number(state.end_timestamp) * 1000
        : Date.now() + 86400000;

      return {
        id: marketId,
        question: String(state.question ?? `Market #${marketId}`),
        category: String(state.category ?? "General"),
        endTime,
        status,
        yesPool,
        noPool,
        totalPool: yesPool + noPool,
        resolvedOutcome,
      };
    } catch {
      return null;
    }
  }

  async getPosition(marketId: string, userAddress: string): Promise<Position | null> {
    if (!this.contract || !this.server) return null;
    const contract = this.contract;
    const server = this.server;
    try {
      const marketIdNum = parseInt(marketId, 10);

      const readShares = async (side: 0 | 1): Promise<number> => {
        try {
          const keyVal = xdr.ScVal.scvVec([
            nativeToScVal("Shares", { type: "symbol" }),
            nativeToScVal(marketIdNum, { type: "u32" }),
            nativeToScVal(userAddress, { type: "address" }),
            nativeToScVal(side, { type: "u32" }),
          ]);

          const entry = await server.getContractData(
            contract.address(),
            keyVal,
            rpc.Durability.Persistent
          );

          if (entry && entry.val) {
            const val = scValToNative(entry.val.contractData().val());
            if (typeof val === "bigint" || typeof val === "number") {
              return Number(val) / 10_000_000;
            }
          }
        } catch {
          // Entry not present
        }
        return 0;
      };

      const [yesShares, noShares] = await Promise.all([
        readShares(0),
        readShares(1),
      ]);

      return {
        userId: userAddress,
        marketId,
        yesShares,
        noShares,
        avgYesPrice: null,
        avgNoPrice: null,
      };
    } catch {
      return null;
    }
  }
}
