// types.ts
// Shared TypeScript types used across the frontend.
// These mirror the data shape of the Soroban contract's on-chain state.
// When contract integration is added, these should match the XDR / SDK types
// returned by lib/contract.ts.

// ----- Market ----------------------------------------------------------------

export type MarketStatus = "open" | "resolved_yes" | "resolved_no";

export interface Market {
  /** Unique identifier — on-chain this will be a u32 market_id */
  id: string;
  /** The yes/no question being predicted */
  question: string;
  /** Percentage of total pool on the YES side (0–100) */
  yesPercent: number;
  /** Percentage of total pool on the NO side (0–100) */
  noPercent: number;
  /** Total XLM locked in the market (in base units or display dollars) */
  totalPool: number;
  /** ISO 8601 string — resolution deadline */
  endsAt: string;
  status: MarketStatus;
  /** Display tag used for colour-coding cards */
  category: string;
}

// ----- Position --------------------------------------------------------------

export interface Position {
  /** Number of YES shares held by the connected wallet */
  yesShares: number;
  /** Number of NO shares held by the connected wallet */
  noShares: number;
  /** Average price paid per YES share (null if no position) */
  avgYesPrice: number | null;
  /** Average price paid per NO share (null if no position) */
  avgNoPrice: number | null;
}

// ----- Wallet ----------------------------------------------------------------

export interface WalletState {
  /** Stellar public key (G...) of the connected wallet, null if disconnected */
  publicKey: string | null;
  /** Human-readable wallet name, e.g. "Freighter" */
  walletName: string | null;
  connected: boolean;
}
