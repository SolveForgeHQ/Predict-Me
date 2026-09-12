// contract.ts
// Soroban contract interactions via @stellar/stellar-sdk.
//
// Only createMarket is fully implemented. All other functions remain stubs
// until their respective passes.
//
// Required .env.local:
//   NEXT_PUBLIC_SOROBAN_RPC_URL       — e.g. https://soroban-testnet.stellar.org
//   NEXT_PUBLIC_MARKET_CONTRACT_ID    — deployed C... address
//   NEXT_PUBLIC_ADMIN_ADDRESS         — admin wallet public key

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
import { signTransaction, STELLAR_NETWORK_PASSPHRASE } from "@/lib/wallet";
import type { Market, Position, MarketStatus } from "@/lib/types";

// ── Config ───────────────────────────────────────────────────

const CONTRACT_ID = process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID ?? "";
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "";

function isConfigured(): boolean {
  return Boolean(CONTRACT_ID && RPC_URL);
}

function getServer(): rpc.Server {
  return new rpc.Server(RPC_URL, {
    allowHttp: RPC_URL.startsWith("http://"),
  });
}

// ── Error type ───────────────────────────────────────────────

export class ContractError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "WALLET_REQUIRED"
      | "SIMULATION_FAILED"
      | "SIGN_REJECTED"
      | "SUBMIT_FAILED"
      | "UNKNOWN",
    message: string
  ) {
    super(message);
    this.name = "ContractError";
  }
}

// ── Shared transaction helpers ────────────────────────────────

/**
 * Build, simulate, assemble, sign, and submit a contract invocation.
 * Returns the transaction hash on success.
 * Throws ContractError on any failure.
 */
async function invokeContract(
  callerPublicKey: string,
  method: string,
  args: xdr.ScVal[]
): Promise<string> {
  if (!isConfigured()) {
    throw new ContractError(
      "NOT_CONFIGURED",
      "Contract address or RPC URL is not configured. Set NEXT_PUBLIC_MARKET_CONTRACT_ID and NEXT_PUBLIC_SOROBAN_RPC_URL in .env.local."
    );
  }

  const server = getServer();
  const contract = new Contract(CONTRACT_ID);

  // Load the caller's current sequence number from the network
  const accountData = await server.getAccount(callerPublicKey);
  const account = new Account(callerPublicKey, (accountData as any).sequence);

  // Build the transaction
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  // Simulate to get the resource footprint
  const simResult = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) {
    throw new ContractError(
      "SIMULATION_FAILED",
      `Contract simulation failed: ${simResult.error}`
    );
  }

  // Assemble adds the resource fee and auth entries from simulation
  const preparedTx = rpc.assembleTransaction(tx, simResult).build();

  // Sign via Freighter
  let signedXdr: string;
  try {
    signedXdr = await signTransaction(preparedTx.toXDR());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.toLowerCase().includes("rejected") ||
      msg.toLowerCase().includes("denied") ||
      msg.toLowerCase().includes("cancelled")
    ) {
      throw new ContractError("SIGN_REJECTED", "Transaction was rejected in Freighter.");
    }
    throw new ContractError("SIGN_REJECTED", msg);
  }

  // Submit
  const submittedTx = TransactionBuilder.fromXDR(
    signedXdr,
    STELLAR_NETWORK_PASSPHRASE
  );
  const sendResult = await server.sendTransaction(submittedTx);

  if (sendResult.status === "ERROR") {
    throw new ContractError(
      "SUBMIT_FAILED",
      `Transaction failed: ${sendResult.errorResult?.toXDR("base64") ?? "unknown error"}`
    );
  }

  // Poll until finalised (PENDING → SUCCESS/FAILED)
  const hash = sendResult.hash;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusResult = await server.getTransaction(hash);
    if (statusResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return hash;
    }
    if (statusResult.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new ContractError(
        "SUBMIT_FAILED",
        `Transaction ${hash} was included in a ledger but execution failed.`
      );
    }
    // NOT_FOUND means still pending — keep polling
  }

  // Timed out polling — transaction may still succeed; return hash anyway
  return hash;
}

// ── create_market ─────────────────────────────────────────────

/**
 * Calls create_market(question, end_timestamp, category) on the contract.
 *
 * Contract signature (contracts/src/lib.rs):
 *   create_market(env, question: String, end_timestamp: u64, category: String) -> u32
 *
 * @param callerPublicKey — must match the contract's stored admin address
 * @param question        — market question text
 * @param endTimestamp    — Unix seconds (not milliseconds)
 * @param category        — display category string
 * @returns transaction hash
 * @throws ContractError
 */
export async function createMarket(
  callerPublicKey: string,
  question: string,
  endTimestamp: number,
  category: string
): Promise<string> {
  if (!callerPublicKey) {
    throw new ContractError("WALLET_REQUIRED", "Wallet must be connected to create a market.");
  }

  const args: xdr.ScVal[] = [
    nativeToScVal(question,      { type: "string" }),
    nativeToScVal(endTimestamp,  { type: "u64"    }),
    nativeToScVal(category,      { type: "string" }),
  ];

  return invokeContract(callerPublicKey, "create_market", args);
}

// ── Stubs — not yet implemented ───────────────────────────────

/**
 * Fetches all markets directly from the Soroban contract via RPC.
 */
export async function fetchMarkets(): Promise<Market[] | null> {
  if (!isConfigured()) {
    return null;
  }

  const server = getServer();
  const contract = new Contract(CONTRACT_ID);

  try {
    let marketCount = 0;
    try {
      const countKey = xdr.ScVal.scvVec([
        nativeToScVal("MarketCount", { type: "symbol" }),
      ]);
      const entry = await server.getContractData(
        contract.address(),
        countKey,
        (rpc.Durability as any).Instance ?? (rpc.Durability as any).Temporary
      );
      if (entry && entry.val) {
        const val = scValToNative(entry.val.contractData().val());
        if (typeof val === "number") marketCount = val;
        else if (typeof val === "bigint") marketCount = Number(val);
      }
    } catch {
      marketCount = 0;
    }

    if (marketCount === 0) return null;

    const list: Market[] = [];
    for (let id = 1; id <= marketCount; id++) {
      try {
        const marketKey = xdr.ScVal.scvVec([
          nativeToScVal("Market", { type: "symbol" }),
          nativeToScVal(id, { type: "u32" }),
        ]);
        const entry = await server.getContractData(
          contract.address(),
          marketKey,
          rpc.Durability.Persistent
        );
        if (entry && entry.val) {
          const state = scValToNative(entry.val.contractData().val());
          if (state) {
            const rawStatus = Number(state.status ?? 0);
            const status: MarketStatus =
              rawStatus === 0 ? "open" : rawStatus === 1 ? "resolved_yes" : "resolved_no";
            const yesPool = state.yes_pool ? Number(state.yes_pool) / 10_000_000 : 0;
            const noPool = state.no_pool ? Number(state.no_pool) / 10_000_000 : 0;
            const total = yesPool + noPool;
            const yesPercent = total > 0 ? Math.round((yesPool / total) * 100) : 50;
            const noPercent = total > 0 ? 100 - yesPercent : 50;
            const endsAt = state.end_timestamp
              ? new Date(Number(state.end_timestamp) * 1000).toISOString()
              : new Date(Date.now() + 86400000).toISOString();

            list.push({
              id: String(id),
              question: String(state.question ?? `Market #${id}`),
              category: String(state.category ?? "General"),
              yesPercent,
              noPercent,
              totalPool: total,
              endsAt,
              status,
            });
          }
        }
      } catch {
        // Skip single errored market
      }
    }

    return list.length > 0 ? list : null;
  } catch (err) {
    console.warn("contract.ts: fetchMarkets failed:", err);
    return null;
  }
}

export async function fetchMarket(marketId: string): Promise<Market | null> {
  console.warn("contract.ts: fetchMarket() not yet implemented", marketId);
  return null;
}

/**
 * Reads the YES and NO share balances for a given wallet and market directly from the contract.
 *
 * @param callerPublicKey — connected wallet public key
 * @param marketId        — market ID
 * @returns Position object with yesShares and noShares
 */
export async function fetchPosition(
  callerPublicKey: string,
  marketId: string | number
): Promise<Position | null> {
  if (!callerPublicKey || !isConfigured()) {
    return null;
  }

  const marketIdNum = typeof marketId === "number" ? marketId : parseInt(marketId, 10) || 1;
  const server = getServer();
  const contract = new Contract(CONTRACT_ID);

  try {
    async function readSharesForSide(side: 0 | 1): Promise<number> {
      try {
        // DataKey::Shares(u32, Address, u32)
        const keyVal = xdr.ScVal.scvVec([
          nativeToScVal("Shares", { type: "symbol" }),
          nativeToScVal(marketIdNum, { type: "u32" }),
          nativeToScVal(callerPublicKey, { type: "address" }),
          nativeToScVal(side, { type: "u32" }),
        ]);

        const ledgerEntry = await server.getContractData(
          contract.address(),
          keyVal,
          rpc.Durability.Persistent
        );

        if (ledgerEntry && ledgerEntry.val) {
          const val = scValToNative(ledgerEntry.val.contractData().val());
          if (typeof val === "bigint" || typeof val === "number") {
            // Amount is in stroops (1 XLM = 10^7 stroops)
            return Number(val) / 10_000_000;
          }
        }
      } catch {
        // Entry not present on ledger indicates 0 shares
      }
      return 0;
    }

    const [yesShares, noShares] = await Promise.all([
      readSharesForSide(0),
      readSharesForSide(1),
    ]);

    return {
      yesShares,
      noShares,
      avgYesPrice: null,
      avgNoPrice: null,
    };
  } catch (err) {
    console.warn("fetchPosition failed:", err);
    return {
      yesShares: 0,
      noShares: 0,
      avgYesPrice: null,
      avgNoPrice: null,
    };
  }
}


/**
 * Calls buy_shares(market_id, side, amount) on the contract.
 *
 * Contract signature (contracts/src/lib.rs):
 *   buy_shares(env, market_id: u32, side: u32, amount: i128)
 *
 * @param callerPublicKey — connected wallet public key
 * @param marketId        — market ID (converted to u32)
 * @param side            — "YES" (0) or "NO" (1)
 * @param amountXlm       — XLM amount (converted to stroops: 1 XLM = 10,000,000 stroops)
 * @returns transaction hash
 * @throws ContractError
 */
export async function buyShares(
  callerPublicKey: string,
  marketId: string | number,
  side: "YES" | "NO",
  amountXlm: number
): Promise<string> {
  if (!callerPublicKey) {
    throw new ContractError("WALLET_REQUIRED", "Wallet must be connected to buy shares.");
  }

  const marketIdNum = typeof marketId === "number" ? marketId : parseInt(marketId, 10) || 1;
  const sideNum = side === "YES" ? 0 : 1;
  const amountStroops = BigInt(Math.round(amountXlm * 10_000_000));

  if (amountStroops <= 0n) {
    throw new ContractError("UNKNOWN", "Amount must be greater than 0 XLM.");
  }

  const args: xdr.ScVal[] = [
    nativeToScVal(marketIdNum,    { type: "u32"  }),
    nativeToScVal(sideNum,        { type: "u32"  }),
    nativeToScVal(amountStroops,  { type: "i128" }),
  ];

  return invokeContract(callerPublicKey, "buy_shares", args);
}

/**
 * Calls resolve_market(market_id, outcome) on the contract. Admin only.
 *
 * Contract signature (contracts/src/lib.rs):
 *   resolve_market(env, market_id: u32, outcome: u32)
 *
 * @param callerPublicKey — admin wallet public key
 * @param marketId        — market ID (converted to u32)
 * @param outcome         — "YES" (0) or "NO" (1)
 * @returns transaction hash
 * @throws ContractError
 */
export async function resolveMarket(
  callerPublicKey: string,
  marketId: string | number,
  outcome: "YES" | "NO"
): Promise<string> {
  if (!callerPublicKey) {
    throw new ContractError("WALLET_REQUIRED", "Wallet must be connected to resolve a market.");
  }

  const marketIdNum = typeof marketId === "number" ? marketId : parseInt(marketId, 10) || 1;
  const outcomeNum = outcome === "YES" ? 0 : 1;

  const args: xdr.ScVal[] = [
    nativeToScVal(marketIdNum, { type: "u32" }),
    nativeToScVal(outcomeNum,  { type: "u32" }),
  ];

  return invokeContract(callerPublicKey, "resolve_market", args);
}

/**
 * Calls claim_winnings(market_id) on the contract.
 *
 * Contract signature (contracts/src/lib.rs):
 *   claim_winnings(env, market_id: u32)
 *
 * @param callerPublicKey — connected wallet public key
 * @param marketId        — market ID (converted to u32)
 * @returns transaction hash
 * @throws ContractError
 */
export async function claimWinnings(
  callerPublicKey: string,
  marketId: string | number
): Promise<string> {
  if (!callerPublicKey) {
    throw new ContractError("WALLET_REQUIRED", "Wallet must be connected to claim winnings.");
  }

  const marketIdNum = typeof marketId === "number" ? marketId : parseInt(marketId, 10) || 1;

  const args: xdr.ScVal[] = [
    nativeToScVal(marketIdNum, { type: "u32" }),
  ];

  return invokeContract(callerPublicKey, "claim_winnings", args);
}

