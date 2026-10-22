"use client";

// WalletContext.tsx
// Unified wallet state for predict-me.
// EVM chains (Sonic, Avalanche) use wagmi for account tracking + EIP-6963
// for direct wallet selection. The connect modal is a custom two-step flow.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { loginWithWallet, logoutFromBackend } from "@/lib/auth";
import { useChain, CHAIN_METADATA } from "@/context/ChainContext";
import { useAccount, useDisconnect, useSwitchChain, useConnect } from "wagmi";
import { reconnect } from "@wagmi/core";
import { wagmiConfig } from "@/providers/RainbowWeb3Provider";

type WalletErrorCode =
  | "NOT_INSTALLED"
  | "REJECTED"
  | "WRONG_NETWORK"
  | "AUTH_FAILED"
  | "CIRCUIT_OPEN"
  | "UNKNOWN";

interface WalletContextValue {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  isWrongNetwork: boolean;
  targetChainName: string;
  switchNetwork: () => Promise<void>;
  error: { code: WalletErrorCode; message: string } | null;
  connect: () => void;
  disconnect: () => Promise<void>;
  clearError: () => void;
  evmAddress: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { chain } = useChain();
  const { address: evmAddress, isConnected: isEvmConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { disconnectAsync: disconnectEvm } = useDisconnect();

  const [error, setError] = useState<WalletContextValue["error"]>(null);
  const [showModal, setShowModal] = useState(false);

  // ── Chain-aware values ──
  const isEvm = chain === "avalanche" || chain === "sonic";
  const targetChainName = chain === "avalanche" ? "Avalanche Fuji" : chain === "sonic" ? "Sonic Testnet" : "Stellar Testnet";
  const expectedEvmChainId = CHAIN_METADATA[chain].evmChainId;

  const isWrongNetwork = Boolean(
    isEvm && isEvmConnected && chainId !== undefined &&
    expectedEvmChainId !== undefined && chainId !== expectedEvmChainId
  );

  const switchNetwork = useCallback(async () => {
    if (isEvm && switchChainAsync && expectedEvmChainId !== undefined) {
      try {
        await switchChainAsync({ chainId: expectedEvmChainId });
      } catch (err) {
        console.warn("Failed to switch network:", err);
      }
    }
  }, [isEvm, switchChainAsync, expectedEvmChainId]);

  // ── Auto-reconnect on page load ──
  // wagmi v2 handles this via its own storage, but we also trigger
  // reconnect explicitly to catch sessions that weren't persisted by wagmi.
  useEffect(() => {
    reconnect(wagmiConfig);
  }, []);

  const publicKey = isEvm ? (evmAddress ?? null) : null;
  const connected = isEvm ? Boolean(isEvmConnected && evmAddress) : false;

  // connecting = modal is showing the connecting step
  const connecting = false; // managed by the modal component itself

  const connect = useCallback(() => {
    setShowModal(true);
  }, []);

  const disconnect = useCallback(async () => {
    if (isEvm) {
      try {
        await disconnectEvm();
      } catch (err) {
        console.warn("EVM disconnect error:", err);
      }
      await logoutFromBackend().catch(() => {});
    }
  }, [isEvm, disconnectEvm]);

  const clearError = useCallback(() => setError(null), []);

  // Render the modal at the context level so it's available everywhere
  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connected,
        connecting,
        isWrongNetwork,
        targetChainName,
        switchNetwork,
        error,
        connect,
        disconnect,
        clearError,
        evmAddress: evmAddress ?? null,
      }}
    >
      {children}
      {showModal && (
        // Lazy-import to avoid SSR issues
        (() => {
          const ConnectModal = require("@/components/ConnectModal").default as typeof import("@/components/ConnectModal").default;
          return <ConnectModal onClose={() => setShowModal(false)} />;
        })()
      )}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
