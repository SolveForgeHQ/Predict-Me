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
  SorobanRpc,
  TransactionBuilder,
  Contract,
  Networks,
  BASE_FEE,
  nativeToScVal,
  xdr,
  Account,
} from "@stellar/stellar-sdk";
import { signTransaction, STELLAR_NETWORK_PASSPHRASE } from "@/lib/wallet";
import type { Market, Position } from "@/lib/types";

// ── Config ───────────────────────────────────────────────────

const CONTRACT_ID = process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID ?? "";
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "";

function isConfigured(): boolean {
  return Boolean(CONTRACT_ID && RPC_URL);
}

function getServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(RPC_URL, {
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
  const account = new Account(callerPublicKey, accountData.sequence);

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
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new ContractError(
      "SIMULATION_FAILED",
      `Contract simulation failed: ${simResult.error}`
    );
  }

  // Assemble adds the resource fee and auth entries from simulation
  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();

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
    if (statusResult.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return hash;
    }
    if (statusResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
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

export async function fetchMarkets(): Promise<Market[] | null> {
  console.warn("contract.ts: fetchMarkets() not yet implemented");
  return null;
}

export async function fetchMarket(marketId: string): Promise<Market | null> {
  console.warn("contract.ts: fetchMarket() not yet implemented", marketId);
  return null;
}

export async function fetchPosition(
  marketId: string,
  publicKey: string
): Promise<Position | null> {
  console.warn("contract.ts: fetchPosition() not yet implemented", marketId, publicKey);
  return null;
}

export async function buyShares(
  marketId: string,
  side: "YES" | "NO",
  amount: bigint
): Promise<string | null> {
  console.warn("contract.ts: buyShares() not yet implemented", { marketId, side, amount });
  return null;
}

export async function resolveMarket(
  marketId: string,
  outcome: "YES" | "NO"
): Promise<string | null> {
  console.warn("contract.ts: resolveMarket() not yet implemented", { marketId, outcome });
  return null;
}

export async function claimWinnings(marketId: string): Promise<string | null> {
  console.warn("contract.ts: claimWinnings() not yet implemented", marketId);
  return null;
}
