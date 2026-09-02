/**
 * api.ts
 * Thin fetch wrapper that automatically attaches the session JWT to every
 * request and throws a typed error when the server responds with a non-2xx
 * status.
 *
 * Usage:
 *   import { apiFetch } from "@/lib/api";
 *   const data = await apiFetch<Market[]>("/markets");
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8787";

const SESSION_KEY = "predict-me:session";

// ── Token helpers ─────────────────────────────────────────────

export function storeSessionToken(token: string): void {
  if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, token);
}

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_KEY);
}

export function clearSessionToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
}

// ── Typed error ───────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Core fetch wrapper ────────────────────────────────────────

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getSessionToken();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    // Try to pull a message from the JSON body, fall back to status text
    let message = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}
