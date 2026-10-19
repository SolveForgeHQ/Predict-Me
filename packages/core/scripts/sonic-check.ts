/**
 * Read-only check script for the Sonic testnet PredictionMarketERC20 deployment.
 *
 * Usage:
 *   npx tsx packages/core/scripts/sonic-check.ts
 *
 * Reads from environment variables:
 *   NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS  (required)
 *   NEXT_PUBLIC_SONIC_RPC_URL           (optional, defaults to public Sonic testnet RPC)
 *   NEXT_PUBLIC_SONIC_TOKEN_ADDRESS     (optional, printed for reference)
 */

import { createPublicClient, http, type Address } from "viem";
import { sonicTestnet, SonicMarketClient } from "../src/sonic";

async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS as Address | undefined;
  const rpcUrl = process.env.NEXT_PUBLIC_SONIC_RPC_URL ?? "https://rpc.testnet.soniclabs.com";
  const tokenAddress = process.env.NEXT_PUBLIC_SONIC_TOKEN_ADDRESS;

  if (!contractAddress) {
    console.error("ERROR: NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS is not set.");
    process.exit(1);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Sonic Testnet — PredictionMarketERC20 Check");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  RPC URL:         ${rpcUrl}`);
  console.log(`  Contract:        ${contractAddress}`);
  if (tokenAddress) {
    console.log(`  Token (from env): ${tokenAddress}`);
  }
  console.log("");

  const publicClient = createPublicClient({
    chain: sonicTestnet,
    transport: http(rpcUrl),
  });

  const client = new SonicMarketClient({
    contractAddress,
    publicClient: publicClient as any,
  });

  // ── Token info (reads symbol + decimals on-chain) ──
  try {
    const tokenInfo = await client.getTokenInfo();
    console.log(`  Token Symbol:    ${tokenInfo.symbol}`);
    console.log(`  Token Decimals:  ${tokenInfo.decimals}`);
  } catch (err) {
    console.error("  Failed to read token info:", err);
  }

  // ── Owner ──
  try {
    const owner = await client.getOwner();
    console.log(`  Owner:           ${owner ?? "N/A"}`);
  } catch (err) {
    console.error("  Failed to read owner:", err);
  }

  // ── Market count ──
  try {
    const count = await client.getMarketCount();
    console.log(`  Market Count:    ${count}`);
  } catch (err) {
    console.error("  Failed to read market count:", err);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
