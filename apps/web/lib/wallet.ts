// wallet.ts
// Real Freighter wallet integration via @creit.tech/stellar-wallets-kit v2.
//
// StellarWalletsKit is a static-only class — never instantiated with `new`.
// Init must happen once at app startup (see WalletProvider).
//
// Public interface consumed by the rest of the app:
//   initKit()          — call once at startup
//   connectWallet()    — opens authModal, returns publicKey or throws WalletError
//   disconnectWallet() — clears kit state + localStorage
//   getStoredAddress() — reads persisted address from localStorage (for SSR-safe hydration)
//   signTransaction()  — signs an XDR envelope via Freighter (for future use)

import {
  StellarWalletsKit,
  Networks,
  KitEventType,
} from "@creit.tech/stellar-wallets-kit";
import {
  FreighterModule,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit/modules/freighter";

// ── Constants ────────────────────────────────────────────────

export const STELLAR_NETWORK = Networks.TESTNET;
export const STELLAR_NETWORK_PASSPHRASE =
  "Test SDF Network ; September 2015";
const STORAGE_KEY = "predict-me:wallet";

// ── Error types ──────────────────────────────────────────────

export type WalletErrorCode =
  | "NOT_INSTALLED"
  | "REJECTED"
  | "WRONG_NETWORK"
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

  StellarWalletsKit.init({
    modules: [new FreighterModule()],
    selectedWalletId: FREIGHTER_ID,
    network: STELLAR_NETWORK,
  });

  // Listen for disconnect events to clear localStorage
  StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
    localStorage.removeItem(STORAGE_KEY);
  });
}

// ── Connection ───────────────────────────────────────────────

/**
 * Opens the Freighter connection flow.
 * Returns the connected public key.
 * Throws WalletError on failure.
 */
export async function connectWallet(): Promise<string> {
  initKit();

  // Check Freighter is installed first
  const module = new FreighterModule();
  const available = await module.isAvailable();
  if (!available) {
    throw new WalletError(
      "NOT_INSTALLED",
      "Freighter is not installed. Download it at freighter.app."
    );
  }

  let address: string;
  try {
    const result = await StellarWalletsKit.authModal();
    address = result.address;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Freighter throws a specific message when user rejects
    if (
      msg.toLowerCase().includes("rejected") ||
      msg.toLowerCase().includes("denied") ||
      msg.toLowerCase().includes("cancelled") ||
      msg.toLowerCase().includes("canceled")
    ) {
      throw new WalletError("REJECTED", "Connection request was rejected.");
    }
    throw new WalletError("UNKNOWN", msg);
  }

  // Verify the connected network is Testnet
  try {
    const { networkPassphrase } = await module.getNetwork();
    if (networkPassphrase !== STELLAR_NETWORK_PASSPHRASE) {
      await StellarWalletsKit.disconnect();
      throw new WalletError(
        "WRONG_NETWORK",
        "Freighter is connected to the wrong network. Switch to Testnet in Freighter settings."
      );
    }
  } catch (err) {
    if (err instanceof WalletError) throw err;
    // getNetwork can fail on some Freighter versions — don't block connection
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
  await StellarWalletsKit.disconnect();
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Returns the persisted address from localStorage.
 * Used for hydration on page load — does not hit Freighter.
 * Safe to call server-side (returns null).
 */
export function getStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Attempts to restore the session silently on page load.
 * Returns the address if Freighter still has the permission granted,
 * null otherwise. Never prompts the user.
 */
export async function restoreSession(): Promise<string | null> {
  initKit();
  const stored = getStoredAddress();
  if (!stored) return null;

  try {
    const module = new FreighterModule();
    const available = await module.isAvailable();
    if (!available) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // skipRequestAccess: true — only returns address if permission already granted
    const { address } = await module.getAddress({ skipRequestAccess: true });
    if (address && address === stored) {
      // Re-init kit with the restored wallet selection
      StellarWalletsKit.setWallet(FREIGHTER_ID);
      return address;
    }
  } catch {
    // No active session — silently clear storage
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

// ── Signing (wired up in a future pass) ─────────────────────

/**
 * Signs an XDR transaction envelope via Freighter.
 * Returns the signed XDR, or throws WalletError.
 */
export async function signTransaction(xdr: string): Promise<string> {
  initKit();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  });
  return signedTxXdr;
}

// ── Helpers ──────────────────────────────────────────────────

/** Truncates a Stellar public key for display: GABCD...WXYZ */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 5)}...${address.slice(-4)}`;
}
