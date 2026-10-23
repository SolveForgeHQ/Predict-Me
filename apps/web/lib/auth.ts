/**
 * auth.ts
 * Post-connect authentication handshake:
 *   1. Build a JSON message: { address, timestamp }
 *   2. Ask the wallet to sign it
 *   3. POST to /auth/login — the backend verifies the signature and sets
 *      an HttpOnly session cookie. No token is returned to JS.
 *
 * Logout sends POST /auth/logout which clears the cookie server-side.
 */

import { signMessage, WalletError } from "@/lib/wallet";
import { apiFetch } from "@/lib/api";

export async function loginWithWallet(address: string): Promise<void> {
  // Include a random nonce so every login produces a distinct JWT even for
  // the same address — the nonce is part of the signed payload.
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const message = JSON.stringify({ address, timestamp: Date.now(), nonce });
  const signedMessage = await signMessage(message);

  try {
    await apiFetch<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ address, message, signedMessage }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Backend authentication failed.";
    throw new WalletError("AUTH_FAILED", detail);
  }
  // Cookie is set by the backend — nothing to store in JS.
}

export async function logoutFromBackend(): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });
  } catch {
    // Best-effort — wallet disconnect still clears local state.
  }
}
