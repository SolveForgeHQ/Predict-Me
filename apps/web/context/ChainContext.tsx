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
} from "@predict-me/core";
import { createPublicClient, createWalletClient, custom, http, type Address } from "viem";
import { avalancheFuji } from "viem/chains";
import { signTransaction, STELLAR_NETWORK_PASSPHRASE } from "@/lib/wallet";

export type ChainId = "avalanche" | "stellar";

export interface ChainMetadata {
  id: ChainId;
  name: string;
  shortName: string;
  currency: string;
  color: string;
  badgeBg: string;
  borderColor: string;
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
  },
  stellar: {
    id: "stellar",
    name: "Stellar Testnet",
    shortName: "Stellar",
    currency: "XLM",
    color: "#00D084",
    badgeBg: "rgba(0, 208, 132, 0.15)",
    borderColor: "rgba(0, 208, 132, 0.35)",
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

  // Restore chain selection from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ChainId | null;
      if (saved && (saved === "stellar" || saved === "avalanche")) {
        setChainState(saved);
      }
    } catch {
      // Ignore localStorage access issues
    }
    setMounted(true);
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
    setChain(chain === "stellar" ? "avalanche" : "stellar");
  }, [chain, setChain]);

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

      let walletClient: any = undefined;
      if (typeof window !== "undefined" && (window as any).ethereum) {
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

    // Stellar (Soroban) Client
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
      "https://soroban-testnet.stellar.org";
    const contractId = process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID ?? "";

    return new StellarMarketClient({
      contractId,
      rpcUrl,
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
      signTransaction: async (xdrString: string) => {
        return signTransaction(xdrString);
      },
    });
  }, [chain]);

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
