"use client";

// WalletContext.tsx
// Unified wallet state for predict-me supporting dual chains:
// - Stellar: Freighter & multi-wallet via @creit.tech/stellar-wallets-kit
// - Avalanche: RainbowKit / Wagmi connectors (MetaMask, Coinbase, WalletConnect, etc.)

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  connectWallet as connectStellarWallet,
  disconnectWallet as disconnectStellarWallet,
  restoreSession as restoreStellarSession,
  initKit,
  WalletError,
  type WalletErrorCode,
} from "@/lib/wallet";
import { loginWithWallet } from "@/lib/auth";
import { clearSessionToken } from "@/lib/api";
import { useChain } from "@/context/ChainContext";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { avalancheFuji } from "viem/chains";
import { useConnectModal } from "@rainbow-me/rainbowkit";

// ── Context shape ────────────────────────────────────────────

interface WalletContextValue {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  isWrongNetwork: boolean;
  targetChainName: string;
  switchNetwork: () => Promise<void>;
  /** null = no error */
  error: { code: WalletErrorCode; message: string } | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  // Specific chain addresses
  stellarPublicKey: string | null;
  evmAddress: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const { chain } = useChain();

  // ── Stellar State ──
  const [stellarPublicKey, setStellarPublicKey] = useState<string | null>(null);
  const [stellarConnecting, setStellarConnecting] = useState(false);
  const [stellarError, setStellarError] = useState<WalletContextValue["error"]>(null);
  const [restoringStellar, setRestoringStellar] = useState(true);

  // ── Avalanche / EVM State (Wagmi + RainbowKit) ──
  const { address: evmAddress, isConnected: isEvmConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { disconnectAsync: disconnectEvm } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  // Track whether the USER explicitly clicked "Connect Wallet".
  // We do NOT use wagmi's isConnecting/isReconnecting because those also fire
  // on page load (background session restore) and whenever the chain selector
  // switches to Avalanche — causing the button to spin with no user action.
  const [userInitiatedEvmConnect, setUserInitiatedEvmConnect] = useState(false);

  // Clear the flag once wagmi reports a definitive outcome (connected or idle),
  // or after 30s as a safety net in case the user dismisses the connect modal.
  useEffect(() => {
    if (isEvmConnected) {
      setUserInitiatedEvmConnect(false);
      return;
    }
    if (!userInitiatedEvmConnect) return;
    const timer = setTimeout(() => setUserInitiatedEvmConnect(false), 30_000);
    return () => clearTimeout(timer);
  }, [isEvmConnected, userInitiatedEvmConnect]);

  // Silent session restore on first load for Stellar
  useEffect(() => {
    initKit();
    restoreStellarSession()
      .then((addr) => {
        if (addr) setStellarPublicKey(addr);
      })
      .catch(() => {
        // Silently ignore restore failures
      })
      .finally(() => setRestoringStellar(false));
  }, []);

  const connectStellar = useCallback(async () => {
    setStellarError(null);
    setStellarConnecting(true);
    try {
      const addr = await connectStellarWallet();
      // Authenticate with the backend: sign a message and exchange for a JWT
      await loginWithWallet(addr);
      setStellarPublicKey(addr);
    } catch (err) {
      if (err instanceof WalletError) {
        setStellarError({ code: err.code, message: err.message });
      } else {
        setStellarError({ code: "UNKNOWN", message: "Unexpected error connecting wallet." });
      }
    } finally {
      setStellarConnecting(false);
    }
  }, []);

  const disconnectStellar = useCallback(async () => {
    await disconnectStellarWallet();
    clearSessionToken();
    setStellarPublicKey(null);
    setStellarError(null);
  }, []);

  const clearError = useCallback(() => setStellarError(null), []);

  // ── Chain-Aware Dispatch ──
  const isAvalanche = chain === "avalanche";
  const targetChainName = isAvalanche ? "Avalanche Fuji" : "Stellar Testnet";

  const isWrongNetwork = Boolean(
    isAvalanche &&
    isEvmConnected &&
    chainId !== undefined &&
    chainId !== avalancheFuji.id
  );

  const switchNetwork = useCallback(async () => {
    if (isAvalanche && switchChainAsync) {
      try {
        await switchChainAsync({ chainId: avalancheFuji.id });
      } catch (err) {
        console.warn("Failed to switch network:", err);
      }
    }
  }, [isAvalanche, switchChainAsync]);

  const publicKey = isAvalanche
    ? (evmAddress ?? null)
    : stellarPublicKey;

  const connected = isAvalanche
    ? Boolean(isEvmConnected && evmAddress)
    : Boolean(stellarPublicKey);

  // Spinner only shows when the user explicitly opened the connect modal.
  const connecting = isAvalanche
    ? userInitiatedEvmConnect
    : stellarConnecting;

  const connect = useCallback(async () => {
    if (isAvalanche) {
      if (openConnectModal) {
        setUserInitiatedEvmConnect(true);
        openConnectModal();
      }
    } else {
      await connectStellar();
    }
  }, [isAvalanche, openConnectModal, connectStellar]);

  const disconnect = useCallback(async () => {
    if (isAvalanche) {
      try {
        await disconnectEvm();
      } catch (err) {
        console.warn("EVM disconnect error:", err);
      }
    } else {
      await disconnectStellar();
    }
  }, [isAvalanche, disconnectEvm, disconnectStellar]);

  // Don't render children until we've attempted session restore
  if (restoringStellar) {
    return (
      <WalletContext.Provider
        value={{
          publicKey: null,
          connected: false,
          connecting: false,
          isWrongNetwork: false,
          targetChainName,
          switchNetwork,
          error: null,
          connect,
          disconnect,
          clearError,
          stellarPublicKey: null,
          evmAddress: null,
        }}
      >
        {children}
      </WalletContext.Provider>
    );
  }

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connected,
        connecting,
        isWrongNetwork,
        targetChainName,
        switchNetwork,
        error: isAvalanche ? null : stellarError,
        connect,
        disconnect,
        clearError,
        stellarPublicKey,
        evmAddress: evmAddress ?? null,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
