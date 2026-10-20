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

export type ChainId = "avalanche" | "stellar" | "sonic";

export interface ChainMetadata {
  id: ChainId;
  name: string;
  shortName: string;
  currency: string;
  color: string;
  badgeBg: string;
  borderColor: string;
  /** Block explorer base URL (no trailing slash). */
  explorerBaseUrl: string;
  /** Faucet URL for testnet tokens (native gas). */
  faucetUrl?: string;
  /** Chain ID number for EVM chains (used for wagmi network switching). */
  evmChainId?: number;
}

export const CHAIN_METADATA: Record<ChainId, ChainMetadata> = {
  avalanche: {
    id: "avalanche",
    name: "Avalanche Fuji",
    shortName: "Avalanche",
    currency: "AVAX",
    color: "#E84142",
    badgeBg: "rgba(232, 65, 66, 0.15)",
    borderColor: "rgba(232, 65, 66, 0.35)",
    explorerBaseUrl: "https://testnet.snowtrace.io",
    faucetUrl: "https://faucet.avax-test.network/",
    evmChainId: 43113,
  },
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
  sonic: {
    id: "sonic",
    name: "Sonic Testnet",
    shortName: "Sonic",
    // Default to "S" for the native gas token; trade currency is read from the ERC-20 contract.
    currency: "S",
    color: "#8B5CF6",
    badgeBg: "rgba(139, 92, 246, 0.15)",
    borderColor: "rgba(139, 92, 246, 0.35)",
    explorerBaseUrl: "https://testnet.sonicscan.org",
    faucetUrl: "https://testnet.soniclabs.com/account",
    evmChainId: 14601,
  },
};

const STORAGE_KEY = "predict_me_active_chain";

interface ChainContextValue {
  chain: ChainId;
  chainMetadata: ChainMetadata;
  client: PredictionMarketClient;
  setChain: (chain: ChainId) => void;
  toggleChain: () => void;
}

const ChainContext = createContext<ChainContextValue | null>(null);

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chain, setChainState] = useState<ChainId>("stellar");
  const [mounted, setMounted] = useState(false);
  const { data: wagmiWalletClient } = useWalletClient();

  // Restore chain selection from localStorage on mount
  // Locked to sonic only for now — uncomment when multi-chain is re-enabled
  useEffect(() => {
    setChainState("sonic");
    setMounted(true);
    /*
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ChainId | null;
      if (saved && (saved === "stellar" || saved === "avalanche" || saved === "sonic")) {
        setChainState(saved);
      }
    } catch {
      // Ignore localStorage access issues
    }
    */
  }, []);

  const setChain = useCallback((newChain: ChainId) => {
    setChainState(newChain);
    try {
      localStorage.setItem(STORAGE_KEY, newChain);
    } catch {
      // Ignore
    }
  }, []);

  const toggleChain = useCallback(() => {
    setChain(chain === "stellar" ? "avalanche" : chain === "avalanche" ? "sonic" : "stellar");
  }, [chain, setChain]);

  // Read the connected Stellar public key from localStorage (written by wallet.ts)
  // so we can pass it as defaultCallerPublicKey to StellarMarketClient.
  // We avoid importing WalletContext here (circular dep) by reading the key directly.
  const STELLAR_PK_STORAGE_KEY = "predict-me:wallet";
  const [stellarPublicKey, setStellarPublicKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STELLAR_PK_STORAGE_KEY);
  });

  // Keep it in sync when wallet.ts writes or clears the address
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STELLAR_PK_STORAGE_KEY) {
        setStellarPublicKey(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    // Also poll once on mount in case the tab's own writes don't fire the storage event
    setStellarPublicKey(localStorage.getItem(STELLAR_PK_STORAGE_KEY));
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Instantiate the corresponding PredictionMarketClient implementation based on the active chain
  const client = useMemo<PredictionMarketClient>(() => {
    if (chain === "avalanche") {
      const rpcUrl =
        process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL ??
        "https://api.avax-test.network/ext/bc/C/rpc";
      const contractAddress = (process.env.NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS ??
        "0x0000000000000000000000000000000000000000") as Address;

      const publicClient = createPublicClient({
        chain: avalancheFuji,
        transport: http(rpcUrl),
      });

      let walletClient: any = wagmiWalletClient;
      if (!walletClient && typeof window !== "undefined" && (window as any).ethereum) {
        walletClient = createWalletClient({
          chain: avalancheFuji,
          transport: custom((window as any).ethereum),
        });
      }

      return new AvalancheMarketClient({
        contractAddress,
        publicClient: publicClient as any,
        walletClient,
      });
    }

    if (chain === "sonic") {
      const rpcUrl =
        process.env.NEXT_PUBLIC_SONIC_RPC_URL ??
        "https://rpc.testnet.soniclabs.com";
      const contractAddress = (process.env.NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS ??
        "0x0000000000000000000000000000000000000000") as Address;

      const publicClient = createPublicClient({
        chain: sonicTestnet,
        transport: http(rpcUrl),
      });

      let walletClient: any = wagmiWalletClient;
      if (!walletClient && typeof window !== "undefined" && (window as any).ethereum) {
        walletClient = createWalletClient({
          chain: sonicTestnet,
          transport: custom((window as any).ethereum),
        });
      }

      return new SonicMarketClient({
        contractAddress,
        publicClient: publicClient as any,
        walletClient,
      });
    }

    // Stellar (Soroban) Client
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
      "https://soroban-testnet.stellar.org";
    const contractId = process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID ?? "";

    return new StellarMarketClient({
      contractId,
      rpcUrl,
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
      defaultCallerPublicKey: stellarPublicKey ?? undefined,
      signTransaction: async (xdrString: string) => {
        return signTransaction(xdrString);
      },
    });
  }, [chain, wagmiWalletClient, stellarPublicKey]);

  const chainMetadata = CHAIN_METADATA[chain];

  return (
    <ChainContext.Provider
      value={{
        chain,
        chainMetadata,
        client,
        setChain,
        toggleChain,
      }}
    >
      {children}
    </ChainContext.Provider>
  );
}

export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) {
    throw new Error("useChain must be used inside <ChainProvider>");
  }
  return ctx;
}

export function useMarketClient(): PredictionMarketClient {
  const { client } = useChain();
  return client;
}
