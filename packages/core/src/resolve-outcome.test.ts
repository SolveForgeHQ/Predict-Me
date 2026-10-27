/**
 * Tests for resolveMarket outcome-index resolution in AvalancheMarketClient
 * and SonicMarketClient.
 *
 * Root-cause regression: passing winningOutcomeIndex: 0 used to throw
 * "Outcome index is required" because resolveLocalOutcomeIndex only checked
 * params.outcomeIndex, not params.winningOutcomeIndex. Index 0 is valid so
 * all checks must use `!== undefined`, never truthiness.
 */

import { describe, it, expect, vi, type MockedFunction } from "vitest";
import { AvalancheMarketClient } from "./avalanche";
import { SonicMarketClient } from "./sonic";
import type { PublicClient, WalletClient, Address } from "viem";

// ── Minimal viem mocks ────────────────────────────────────────────────────────

const MOCK_TX = "0xdeadbeef" as `0x${string}`;
const MOCK_RECEIPT = { logs: [] };

function makeWalletClient(address = "0xOwner" as Address) {
  return {
    account: { address },
    chain: { id: 43113 },
    writeContract: vi.fn().mockResolvedValue(MOCK_TX),
  } as unknown as WalletClient;
}

function makePublicClient(overrides: Record<string, unknown> = {}) {
  return {
    waitForTransactionReceipt: vi.fn().mockResolvedValue(MOCK_RECEIPT),
    readContract: vi.fn().mockResolvedValue(null),
    getBlock: vi.fn().mockResolvedValue({ timestamp: BigInt(0) }),
    ...overrides,
  } as unknown as PublicClient;
}

const CONTRACT = "0xb3827768d1db46eA92303f29fe1DF2eB497Eb4fa" as Address;

// ── AvalancheMarketClient ─────────────────────────────────────────────────────

describe("AvalancheMarketClient.resolveMarket — 3-outcome market", () => {
  function makeClient() {
    const walletClient = makeWalletClient();
    const publicClient = makePublicClient();
    const client = new AvalancheMarketClient({
      contractAddress: CONTRACT,
      publicClient,
      walletClient,
    });
    return { client, walletClient, publicClient };
  }

  it("resolves outcome index 0 (Red) via winningOutcomeIndex", async () => {
    const { client, walletClient } = makeClient();
    await client.resolveMarket({
      marketId: "1",
      winningOutcomeIndex: 0,
      callerAddress: "0xOwner",
    });
    const call = (walletClient.writeContract as MockedFunction<typeof walletClient.writeContract>).mock.calls[0][0];
    expect((call.args as unknown[])[1]).toBe(BigInt(0));
  });

  it("resolves outcome index 1 (Blue) via winningOutcomeIndex", async () => {
    const { client, walletClient } = makeClient();
    await client.resolveMarket({
      marketId: "1",
      winningOutcomeIndex: 1,
      callerAddress: "0xOwner",
    });
    const call = (walletClient.writeContract as MockedFunction<typeof walletClient.writeContract>).mock.calls[0][0];
    expect((call.args as unknown[])[1]).toBe(BigInt(1));
  });

  it("resolves outcome index 2 (Purple) via winningOutcomeIndex", async () => {
    const { client, walletClient } = makeClient();
    await client.resolveMarket({
      marketId: "1",
      winningOutcomeIndex: 2,
      callerAddress: "0xOwner",
    });
    const call = (walletClient.writeContract as MockedFunction<typeof walletClient.writeContract>).mock.calls[0][0];
    expect((call.args as unknown[])[1]).toBe(BigInt(2));
  });

  it("index 0 via winningOutcomeIndex does NOT throw (regression for truthiness bug)", async () => {
    const { client } = makeClient();
    await expect(
      client.resolveMarket({ marketId: "1", winningOutcomeIndex: 0, callerAddress: "0xOwner" })
    ).resolves.not.toThrow();
  });

  it("throws when neither index nor outcome is provided", async () => {
    const { client } = makeClient();
    await expect(
      client.resolveMarket({ marketId: "1", callerAddress: "0xOwner" })
    ).rejects.toThrow("Outcome index is required");
  });
});

// ── SonicMarketClient ─────────────────────────────────────────────────────────

const SONIC_CONTRACT = "0x25D035CB295d94A073107aAB9Ac86a3655a5614E" as Address;
const TOKEN_ADDRESS  = "0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02" as Address;

describe("SonicMarketClient.resolveMarket — 3-outcome market", () => {
  function makeSonicClient() {
    const walletClient = makeWalletClient();
    const publicClient = makePublicClient({
      // token() call returns mock token address
      readContract: vi.fn().mockResolvedValue(TOKEN_ADDRESS),
    });
    const client = new SonicMarketClient({
      contractAddress: SONIC_CONTRACT,
      publicClient,
      walletClient,
    });
    return { client, walletClient };
  }

  it("resolves outcome index 0 via winningOutcomeIndex", async () => {
    const { client, walletClient } = makeSonicClient();
    await client.resolveMarket({
      marketId: "1",
      winningOutcomeIndex: 0,
      callerAddress: "0xOwner",
    });
    const call = (walletClient.writeContract as MockedFunction<typeof walletClient.writeContract>).mock.calls[0][0];
    expect((call.args as unknown[])[1]).toBe(BigInt(0));
  });

  it("resolves outcome index 1 via winningOutcomeIndex", async () => {
    const { client, walletClient } = makeSonicClient();
    await client.resolveMarket({
      marketId: "1",
      winningOutcomeIndex: 1,
      callerAddress: "0xOwner",
    });
    const call = (walletClient.writeContract as MockedFunction<typeof walletClient.writeContract>).mock.calls[0][0];
    expect((call.args as unknown[])[1]).toBe(BigInt(1));
  });

  it("resolves outcome index 2 via winningOutcomeIndex", async () => {
    const { client, walletClient } = makeSonicClient();
    await client.resolveMarket({
      marketId: "1",
      winningOutcomeIndex: 2,
      callerAddress: "0xOwner",
    });
    const call = (walletClient.writeContract as MockedFunction<typeof walletClient.writeContract>).mock.calls[0][0];
    expect((call.args as unknown[])[1]).toBe(BigInt(2));
  });

  it("index 0 via winningOutcomeIndex does NOT throw", async () => {
    const { client } = makeSonicClient();
    await expect(
      client.resolveMarket({ marketId: "1", winningOutcomeIndex: 0, callerAddress: "0xOwner" })
    ).resolves.not.toThrow();
  });
});
