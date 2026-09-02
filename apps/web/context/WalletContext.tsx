"use client";

// WalletContext.tsx
// Global wallet state for predict-me.
// Wraps the app so any component can read publicKey and call connect/disconnect.
//
// On mount: attempts silent session restore via Freighter
// On connect: calls connectWallet(), stores address, surfaces errors
// On disconnect: calls disconnectWallet(), clears address

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  connectWallet,
  disconnectWallet,
  restoreSession,
  initKit,
  WalletError,
  type WalletErrorCode,
} from "@/lib/wallet";

// ── Context shape ────────────────────────────────────────────

interface WalletContextValue {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  /** null = no error */
  error: { code: WalletErrorCode; message: string } | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<WalletContextValue["error"]>(null);
  // true while we're attempting silent session restore on mount
  const [restoring, setRestoring] = useState(true);

  // Silent session restore on first load
  useEffect(() => {
    initKit();
    restoreSession()
      .then((addr) => {
        if (addr) setPublicKey(addr);
      })
      .catch(() => {
        // Silently ignore restore failures
      })
      .finally(() => setRestoring(false));
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const addr = await connectWallet();
      setPublicKey(addr);
    } catch (err) {
      if (err instanceof WalletError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ code: "UNKNOWN", message: "Unexpected error connecting wallet." });
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setPublicKey(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Don't render children until we've attempted session restore
  // (avoids flash of "Connect Wallet" for already-connected users)
  if (restoring) {
    return (
      <WalletContext.Provider
        value={{ publicKey: null, connected: false, connecting: false, error: null, connect, disconnect, clearError }}
      >
        {children}
      </WalletContext.Provider>
    );
  }

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connected: publicKey !== null,
        connecting,
        error,
        connect,
        disconnect,
        clearError,
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
