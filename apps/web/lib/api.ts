/**
 * api.ts
 * Thin fetch wrapper. Authentication is handled via an HttpOnly session
 * cookie set by the backend — JS never touches the token directly.
 * `credentials: "include"` tells the browser to send the cookie on every
 * cross-origin request to the backend.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8787";

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
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    // Send the HttpOnly session cookie on every request.
    credentials: "include",
  });

  if (!res.ok) {
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
