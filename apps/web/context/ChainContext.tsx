"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  type PredictionMarketClient,
  StellarMarketClient,
  AvalancheMarketClient,
  SonicMarketClient,
  sonicTestnet,
} from "@predict-me/core";
import { createPublicClient, createWalletClient, custom, http, type Address } from "viem";
import { avalancheFuji } from "viem/chains";
import { useWalletClient } from "wagmi";
import { signTransaction, STELLAR_NETWORK_PASSPHRASE } from "@/lib/wallet";

// Only EVM chains are selectable in the UI. Stellar code is preserved but
// not surfaced — its ChainId is kept for type safety.
export type ChainId = "sonic" | "avalanche" | "stellar";
export type SelectableChainId = "sonic" | "avalanche";

// ── Per-chain capability config ─────────────────────────────────────────────
// Single source of truth. Components read this instead of writing if-statements.

export interface ChainCapabilities {
  /** Whether buying shares requires an ERC-20 Approve step first (Sonic). */
  requiresApprove: boolean;
  /** Whether to show a "Get test tokens" mint button. */
  showMintButton: boolean;
  /** Faucet URL for the native gas token. */
  gasFaucetUrl: string;
  /** Faucet URL for the staking token (may equal gasFaucetUrl). */
  tokenFaucetUrl: string;
  /** Block explorer base URL (no trailing slash). */
  explorerBaseUrl: string;
  /** Default currency symbol (may be overridden by on-chain ERC-20 read). */
  currencySymbol: string;
  /** Decimals for display formatting. */
  currencyDecimals: number;
  /** wagmi chain ID for network switching. */
  evmChainId: number;
}

export interface ChainMetadata {
  id: ChainId;
  name: string;
  shortName: string;
  currency: string;
  color: string;
  badgeBg: string;
  borderColor: string;
  explorerBaseUrl: string;
  faucetUrl?: string;
  evmChainId?: number;
  capabilities?: ChainCapabilities;
}

const SONIC_CAPABILITIES: ChainCapabilities = {
  requiresApprove: true,
  showMintButton: true,
  gasFaucetUrl: "https://testnet.soniclabs.com/account",
  tokenFaucetUrl: "https://testnet.soniclabs.com/account",
  explorerBaseUrl: "https://testnet.sonicscan.org",
  currencySymbol: "S",
  currencyDecimals: 18,
  evmChainId: 14601,
};

const AVALANCHE_CAPABILITIES: ChainCapabilities = {
  requiresApprove: false,
  showMintButton: false,
  gasFaucetUrl: "https://core.app/tools/testnet-faucet/",
  tokenFaucetUrl: "https://core.app/tools/testnet-faucet/",
  explorerBaseUrl: "https://testnet.snowtrace.io",
  currencySymbol: "AVAX",
  currencyDecimals: 18,
  evmChainId: 43113,
};

export const CHAIN_METADATA: Record<ChainId, ChainMetadata> = {
  sonic: {
    id: "sonic",
    name: "Sonic Testnet",
    shortName: "Sonic",
    currency: "S",
    color: "#8B5CF6",
    badgeBg: "rgba(139, 92, 246, 0.15)",
    borderColor: "rgba(139, 92, 246, 0.35)",
    explorerBaseUrl: "https://testnet.sonicscan.org",
    faucetUrl: "https://testnet.soniclabs.com/account",
    evmChainId: 14601,
    capabilities: SONIC_CAPABILITIES,
  },
  avalanche: {
    id: "avalanche",
    name: "Avalanche Fuji",
    shortName: "Avalanche",
    currency: "AVAX",
    color: "#E84142",
    badgeBg: "rgba(232, 65, 66, 0.15)",
    borderColor: "rgba(232, 65, 66, 0.35)",
    explorerBaseUrl: "https://testnet.snowtrace.io",
    faucetUrl: "https://core.app/tools/testnet-faucet/",
    evmChainId: 43113,
    capabilities: AVALANCHE_CAPABILITIES,
  },
  // Stellar: code intact, not shown in UI selector.
  stellar: {
    id: "stellar",
    name: "Stellar Testnet",
    shortName: "Stellar",
    currency: "XLM",
    color: "#00D084",
    badgeBg: "rgba(0, 208, 132, 0.15)",
    borderColor: "rgba(0, 208, 132, 0.35)",
    explorerBaseUrl: "https://stellar.expert/explorer/testnet",
    faucetUrl: "https://faucet.stellar.org/",
  },
};

/** The two chains shown in the chain selector. */
export const SELECTABLE_CHAINS: SelectableChainId[] = ["sonic", "avalanche"];

const STORAGE_KEY = "predict_me_active_chain";
const DEFAULT_CHAIN: SelectableChainId = "sonic";

interface ChainContextValue {
  chain: ChainId;
  chainMetadata: ChainMetadata;
  /** Undefined for Stellar (not selectable). */
  chainCapabilities: ChainCapabilities | undefined;
  client: PredictionMarketClient;
  setChain: (chain: ChainId) => void;
  toggleChain: () => void;
}

const ChainContext = createContext<ChainContextValue | null>(null);

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chain, setChainState] = useState<ChainId>(DEFAULT_CHAIN);
  const { data: wagmiWalletClient } = useWalletClient();

  // Restore persisted chain selection on mount.
  // Only selectable chains are accepted from storage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ChainId | null;
      if (saved && (SELECTABLE_CHAINS as ChainId[]).includes(saved)) {
        setChainState(saved);
      }
    } catch { /* ignore */ }
  }, []);

  const setChain = useCallback((newChain: ChainId) => {
    setChainState(newChain);
    try { localStorage.setItem(STORAGE_KEY, newChain); } catch { /* ignore */ }
  }, []);

  const toggleChain = useCallback(() => {
    const idx = SELECTABLE_CHAINS.indexOf(chain as SelectableChainId);
    setChain(SELECTABLE_CHAINS[(idx + 1) % SELECTABLE_CHAINS.length]);
  }, [chain, setChain]);

  // Stellar public key — read from localStorage without importing WalletContext
  // to avoid a circular dependency.
  const STELLAR_PK_KEY = "predict-me:wallet";
  const [stellarPublicKey, setStellarPublicKey] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(STELLAR_PK_KEY)
  );
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STELLAR_PK_KEY) setStellarPublicKey(e.newValue);
    };
    window.addEventListener("storage", handler);
    setStellarPublicKey(localStorage.getItem(STELLAR_PK_KEY));
    return () => window.removeEventListener("storage", handler);
  }, []);

  const client = useMemo<PredictionMarketClient>(() => {
    if (chain === "avalanche") {
      const rpcUrl = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
      const contractAddress = (process.env.NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
      const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(rpcUrl) });
      let walletClient: any = wagmiWalletClient;
      if (!walletClient && typeof window !== "undefined" && (window as any).ethereum) {
        walletClient = createWalletClient({ chain: avalancheFuji, transport: custom((window as any).ethereum) });
      }
      return new AvalancheMarketClient({ contractAddress, publicClient: publicClient as any, walletClient });
    }

    if (chain === "sonic") {
      const rpcUrl = process.env.NEXT_PUBLIC_SONIC_RPC_URL ?? "https://rpc.testnet.soniclabs.com";
      const contractAddress = (process.env.NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
      const publicClient = createPublicClient({ chain: sonicTestnet, transport: http(rpcUrl) });
      let walletClient: any = wagmiWalletClient;
      if (!walletClient && typeof window !== "undefined" && (window as any).ethereum) {
        walletClient = createWalletClient({ chain: sonicTestnet, transport: custom((window as any).ethereum) });
      }
      return new SonicMarketClient({ contractAddress, publicClient: publicClient as any, walletClient });
    }

    // Stellar — preserved but not surfaced in the UI
    return new StellarMarketClient({
      contractId: process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID ?? "",
      rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
      defaultCallerPublicKey: stellarPublicKey ?? undefined,
      signTransaction: async (xdrString: string) => signTransaction(xdrString),
    });
  }, [chain, wagmiWalletClient, stellarPublicKey]);

  const chainMetadata = CHAIN_METADATA[chain];
  const chainCapabilities = chainMetadata.capabilities;

  return (
    <ChainContext.Provider value={{ chain, chainMetadata, chainCapabilities, client, setChain, toggleChain }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("useChain must be used inside <ChainProvider>");
  return ctx;
}

export function useMarketClient(): PredictionMarketClient {
  return useChain().client;
}
