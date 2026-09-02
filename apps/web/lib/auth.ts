/**
 * auth.ts
 * Handles the post-connect authentication handshake:
 *   1. Build a JSON message: { address, timestamp }
 *   2. Ask Freighter to sign it (Ed25519)
 *   3. POST to /auth/login and store the returned JWT
 *
 * Throws WalletError (code "AUTH_FAILED") if the backend rejects.
 */

import { signMessage, WalletError } from "@/lib/wallet";
import { apiFetch, storeSessionToken } from "@/lib/api";

interface LoginResponse {
  token: string;
}

export async function loginWithWallet(address: string): Promise<void> {
  // 1. Build the message the backend will verify
  const message = JSON.stringify({ address, timestamp: Date.now() });

  // 2. Sign with Freighter — throws WalletError on rejection
  const signedMessage = await signMessage(message);

  // 3. POST to backend — throws ApiError on non-2xx
  let response: LoginResponse;
  try {
    response = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ address, message, signedMessage }),
    });
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Backend authentication failed.";
    throw new WalletError("AUTH_FAILED", detail);
  }

  // 4. Persist the JWT for all future requests
  storeSessionToken(response.token);
}
