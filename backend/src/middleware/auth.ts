/**
 * middleware/auth.ts
 *
 * requireAuth — Hono middleware that verifies the HttpOnly session cookie.
 *
 * On success:  sets c.set('walletAddress', address) and calls next().
 * On failure:  returns 401 JSON immediately.
 *
 * Usage:
 *   import { requireAuth } from '@/middleware/auth';
 *   app.get('/protected', requireAuth, handler);
 */

import { verify } from 'hono/jwt';
import type { Context, Next } from 'hono';

interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  sig: string;
}

/** Pull the session cookie value from the Cookie header. */
function extractSessionCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const cookieHeader = c.req.header('cookie') ?? '';
  const token = extractSessionCookie(cookieHeader);

  if (!token) {
    return c.json({ error: 'Authentication required.' }, 401);
  }

  const secret: string = (c.env as any)?.JWT_SECRET ?? 'dev-secret-change-me';

  let payload: SessionPayload;
  try {
    const raw = await verify(token, secret, 'HS256');
    payload = raw as unknown as SessionPayload;
  } catch {
    return c.json({ error: 'Session expired or invalid. Please reconnect your wallet.' }, 401);
  }

  if (!payload.sub) {
    return c.json({ error: 'Malformed session token.' }, 401);
  }

  // Expose the verified wallet address to downstream handlers.
  c.set('walletAddress', payload.sub);
  return next();
}
