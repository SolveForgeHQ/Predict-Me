// wallet.ts
// Multi-wallet Stellar integration via @creit.tech/stellar-wallets-kit v2.
//
// StellarWalletsKit is a static-only class — never instantiated with `new`.
// Init must happen once at app startup (see WalletProvider).
//
// Public interface consumed by the rest of the app:
//   initKit()          — call once at startup
//   connectWallet()    — opens authModal, returns publicKey or throws WalletError
//   disconnectWallet() — clears kit state + localStorage
//   getStoredAddress() — reads persisted address from localStorage (for SSR-safe hydration)
//   signTransaction()  — signs an XDR envelope via the active wallet
//   signMessage()      — signs an arbitrary message via the active wallet

import {
  StellarWalletsKit,
  Networks,
  KitEventType,
  SwkAppDarkTheme,
} from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { HanaModule } from "@creit.tech/stellar-wallets-kit/modules/hana";

// ── Constants ────────────────────────────────────────────────

export const STELLAR_NETWORK = Networks.TESTNET;
export const STELLAR_NETWORK_PASSPHRASE =
  "Test SDF Network ; September 2015";

const STORAGE_KEY = "predict-me:wallet";
const WALLET_ID_KEY = "predict-me:wallet-id";

// ── Error types ──────────────────────────────────────────────

export type WalletErrorCode =
  | "NOT_INSTALLED"
  | "REJECTED"
  | "WRONG_NETWORK"
  | "AUTH_FAILED"
  | "UNKNOWN";

export class WalletError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WalletError";
  }
}

// ── Kit lifecycle ────────────────────────────────────────────

let _initialized = false;

export function initKit(): void {
  if (_initialized || typeof window === "undefined") return;
  _initialized = true;

  const storedWalletId = getStoredWalletId();

  StellarWalletsKit.init({
    modules: [
      new FreighterModule(),
      new LobstrModule(),
      new xBullModule(),
      new AlbedoModule(),
      new RabetModule(),
      new HanaModule(),
    ],
    selectedWalletId: storedWalletId ?? undefined,
    network: STELLAR_NETWORK,
    theme: SwkAppDarkTheme,
    authModal: {
      showInstallLabel: true,
      hideUnsupportedWallets: false,
    },
  });

  // Track wallet selections
  StellarWalletsKit.on(KitEventType.WALLET_SELECTED, (event) => {
    if (event.payload?.id) {
      localStorage.setItem(WALLET_ID_KEY, event.payload.id);
    }
  });

  // Listen for disconnect events to clear localStorage
  StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(WALLET_ID_KEY);
  });
}

// ── Connection ───────────────────────────────────────────────

/**
 * Opens the StellarWalletsKit auth modal with multiple wallet options (Freighter, Lobstr, xBull, Albedo, etc.).
 * Returns the connected public key.
 * Throws WalletError on failure or user cancellation.
 */
export async function connectWallet(): Promise<string> {
  initKit();

  let address: string;
  try {
    const result = await StellarWalletsKit.authModal();
    address = result.address;
  } catch (err) {
    // Some wallet SDKs throw plain objects, not Error instances — extract a readable message
    let msg: string;
    if (err instanceof Error) {
      msg = err.message;
    } else if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      msg =
        typeof e.message === "string" ? e.message :
        typeof e.reason === "string" ? e.reason :
        typeof e.error === "string"  ? e.error  :
        "Could not connect to wallet. Please try again.";
    } else {
      msg = "Could not connect to wallet. Please try again.";
    }

    if (
      msg.toLowerCase().includes("rejected") ||
      msg.toLowerCase().includes("denied") ||
      msg.toLowerCase().includes("cancelled") ||
      msg.toLowerCase().includes("canceled") ||
      msg.toLowerCase().includes("closed")
    ) {
      throw new WalletError("REJECTED", "Connection request was cancelled.");
    }
    if (msg.toLowerCase().includes("not installed") || msg.toLowerCase().includes("not found")) {
      throw new WalletError("NOT_INSTALLED", msg);
    }
    throw new WalletError("UNKNOWN", msg);
  }

  // Verify the connected network if supported by the wallet module
  try {
    const { networkPassphrase } = await StellarWalletsKit.getNetwork();
    if (networkPassphrase && networkPassphrase !== STELLAR_NETWORK_PASSPHRASE) {
      await StellarWalletsKit.disconnect();
      throw new WalletError(
        "WRONG_NETWORK",
        "Wallet is connected to the wrong network. Please switch to Testnet in your wallet settings."
      );
    }
  } catch (err) {
    if (err instanceof WalletError) throw err;
    // getNetwork is not implemented or can fail on some wallet extensions — don't block
    console.warn("wallet.ts: could not verify network", err);
  }

  // Persist for session restore on reload
  localStorage.setItem(STORAGE_KEY, address);
  return address;
}

/**
 * Disconnects the wallet and clears persisted state.
 */
export async function disconnectWallet(): Promise<void> {
  initKit();
  try {
    await StellarWalletsKit.disconnect();
  } catch (err) {
    console.warn("wallet.ts: disconnect error", err);
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(WALLET_ID_KEY);
}

/**
 * Returns the persisted address from localStorage.
 */
export function getStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Returns the persisted wallet ID from localStorage.
 */
export function getStoredWalletId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WALLET_ID_KEY);
}

/**
 * Attempts to restore the session silently on page load.
 * Returns the address if the wallet still has the permission granted.
 */
export async function restoreSession(): Promise<string | null> {
  initKit();
  const stored = getStoredAddress();
  const storedWalletId = getStoredWalletId();
  if (!stored) return null;

  try {
    if (storedWalletId) {
      StellarWalletsKit.setWallet(storedWalletId);
    }
    const { address } = await StellarWalletsKit.getAddress();
    if (address && address === stored) {
      return address;
    }
  } catch {
    // No active session — silently clear storage
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(WALLET_ID_KEY);
  }
  return null;
}

// ── Signing ──────────────────────────────────────────────────

/**
 * Signs an XDR transaction envelope via the active wallet.
 * Returns the signed XDR, or throws WalletError.
 */
export async function signTransaction(xdr: string): Promise<string> {
  initKit();
  try {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
    });
    return signedTxXdr;
  } catch (err) {
    let msg: string;
    if (err instanceof Error) {
      msg = err.message;
    } else if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      msg =
        typeof e.message === "string" ? e.message :
        typeof e.reason === "string" ? e.reason :
        "Transaction signing failed.";
    } else {
      msg = "Transaction signing failed.";
    }
    if (
      msg.toLowerCase().includes("rejected") ||
      msg.toLowerCase().includes("denied") ||
      msg.toLowerCase().includes("cancelled") ||
      msg.toLowerCase().includes("canceled")
    ) {
      throw new WalletError("REJECTED", "Transaction was rejected in wallet.");
    }
    throw new WalletError("UNKNOWN", msg);
  }
}

/**
 * Signs an arbitrary UTF-8 message via the active wallet.
 * Returns the base64-encoded Ed25519 signature.
 * Throws WalletError if the user rejects or the wallet is unavailable.
 */
export async function signMessage(message: string): Promise<string> {
  initKit();
  try {
    const { signedMessage } = await StellarWalletsKit.signMessage(message);
    return signedMessage;
  } catch (err) {
    let msg: string;
    if (err instanceof Error) {
      msg = err.message;
    } else if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      msg =
        typeof e.message === "string" ? e.message :
        typeof e.reason === "string" ? e.reason :
        "Could not sign message. Please try again.";
    } else {
      msg = "Could not sign message. Please try again.";
    }
    if (
      msg.toLowerCase().includes("rejected") ||
      msg.toLowerCase().includes("denied") ||
      msg.toLowerCase().includes("cancelled") ||
      msg.toLowerCase().includes("canceled")
    ) {
      throw new WalletError("REJECTED", "Signing request was rejected.");
    }
    throw new WalletError("UNKNOWN", msg);
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Truncates a Stellar public key for display: GABCD...WXYZ */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 5)}...${address.slice(-4)}`;
}
