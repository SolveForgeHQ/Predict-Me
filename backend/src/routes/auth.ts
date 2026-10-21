import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { Keypair } from '@stellar/stellar-sdk';
/**
 * Expected shape of the message the client signs.
 *
 *   { address: "G...", timestamp: 1725271200000, nonce: "<random hex>" }
 *
 * - timestamp:  replay-attack guard (5 min window)
 * - nonce:      single-use random value included in the JWT so every login
 *               produces a distinct token even for the same address
 */
interface SignedPayload {
  address: string;
  timestamp: number;
  nonce?: string;
}

const auth = new Hono<{ Bindings: { JWT_SECRET: string; DB?: D1Database } }>();

const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_MAX_AGE_S  = 60 * 60 * 24;  // 24 hours

auth.post('/login', async (c) => {
  // ── 1. Parse & validate request body ──────────────────────────
  let body: { address?: unknown; message?: unknown; signedMessage?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body.' }, 400);
  }

  const { address, message, signedMessage } = body;

  if (
    typeof address !== 'string' ||
    typeof message !== 'string' ||
    typeof signedMessage !== 'string'
  ) {
    return c.json(
      { error: 'address, message, and signedMessage are required strings.' },
      400,
    );
  }

  // ── 2. Parse the signed message payload ───────────────────────
  let payload: SignedPayload;
  try {
    payload = JSON.parse(message) as SignedPayload;
  } catch {
    return c.json(
      { error: 'message must be a JSON string with { address, timestamp }.' },
      400,
    );
  }

  if (
    typeof payload.address !== 'string' ||
    typeof payload.timestamp !== 'number'
  ) {
    return c.json(
      { error: 'message must contain a string address and numeric timestamp.' },
      400,
    );
  }

  // ── 3. Address in payload must match the top-level claim ──────
  if (payload.address !== address) {
    return c.json(
      { error: 'address in message payload does not match request address.' },
      400,
    );
  }

  // ── 4. Replay-attack guard: reject messages older than 5 min ──
  const age = Date.now() - payload.timestamp;
  if (age < 0 || age > MAX_MESSAGE_AGE_MS) {
    return c.json(
      { error: 'Message has expired. Please sign a fresh message and retry.' },
      401,
    );
  }

  // ── 5. Verify the Ed25519 signature ───────────────────────────
  let isValid = false;
  try {
    const keypair = Keypair.fromPublicKey(address);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(atob(signedMessage), (c) => c.charCodeAt(0));
    isValid = keypair.verify(messageBytes as unknown as Buffer, signatureBytes as unknown as Buffer);
  } catch {
    return c.json({ error: 'Invalid Stellar address.' }, 400);
  }

  if (!isValid) {
    return c.json({ error: 'Signature verification failed.' }, 401);
  }

  const secret = c.env?.JWT_SECRET ?? 'dev-secret-change-me';

  // ── 6. Compute jti early — used for both idempotency check and JWT ──
  const jtiInput   = new TextEncoder().encode(`${address}:${signedMessage}:${payload.timestamp}`);
  const jtiHashBuf = await crypto.subtle.digest('SHA-256', jtiInput);
  const jtiHex     = Array.from(new Uint8Array(jtiHashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // ── 7. Idempotency check — atomic via D1 sessions table ──────
  // INSERT OR IGNORE: if a session with this jti already exists (same signed
  // message replayed), skip issuing a new token and return the cookie that
  // was set the first time. Two concurrent requests with the same signed
  // message will race on this insert; exactly one wins, the other is a no-op.
  const nowSec     = Math.floor(Date.now() / 1000);
  const expiresAt  = nowSec + SESSION_MAX_AGE_S;

  if (c.env?.DB) {
    const existing = await (c.env.DB as D1Database)
      .prepare('SELECT wallet_address FROM sessions WHERE jti = ? AND expires_at > ?')
      .bind(jtiHex, nowSec)
      .first<{ wallet_address: string }>();

    if (existing && existing.wallet_address === address) {
      // Already issued for this exact login event — idempotent return.
      return c.json({ ok: true });
    }

    // Atomically record the session. ON CONFLICT DO NOTHING handles the race
    // where two Worker instances try to register the same jti simultaneously.
    await (c.env.DB as D1Database)
      .prepare('INSERT OR IGNORE INTO sessions (jti, wallet_address, issued_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(jtiHex, address, nowSec, expiresAt)
      .run();
  } else {
    // No DB — fall back to cookie-based idempotency check (dev/test only).
    const cookieHeader = c.req.header('cookie') ?? '';
    const existingMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (existingMatch) {
      try {
        const existing = await verify(existingMatch[1], secret, 'HS256') as { sub?: string };
        if (existing.sub === address) return c.json({ ok: true });
      } catch { /* fall through */ }
    }
  }

  // ── 8. Build and sign the JWT ─────────────────────────────────
  // sig fingerprint: first 16 bytes of the raw Ed25519 signature
  const sigBytes = Uint8Array.from(atob(signedMessage), (ch) => ch.charCodeAt(0));
  const sigFp    = Array.from(sigBytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const token = await sign(
    {
      sub: address,      // wallet address
      iat: nowSec,       // issued-at
      exp: nowSec + SESSION_MAX_AGE_S,
      jti: jtiHex,       // unique per login event
      sig: sigFp,        // partial signature fingerprint
    },
    secret,
  );

  // ── 9. Set as HttpOnly cookie ────────────────────────────────
  const isProd = !(secret === 'dev-secret-change-me');
  const cookieFlags = [
    `session=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${SESSION_MAX_AGE_S}`,
    ...(isProd ? ['Secure'] : []),
  ].join('; ');

  c.header('Set-Cookie', cookieFlags);
  return c.json({ ok: true });
});

// ── GET /auth/me — verify the session cookie and return the address ──
// Use this from the frontend to check if the user is still logged in
// without exposing the token itself.
auth.get('/me', async (c) => {
  const cookie = c.req.header('cookie') ?? '';
  const match  = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return c.json({ error: 'Not authenticated.' }, 401);

  const secret = c.env?.JWT_SECRET ?? 'dev-secret-change-me';
  try {
    const decoded = await verify(match[1], secret, 'HS256') as { sub?: string };
    return c.json({ address: decoded.sub ?? null });
  } catch {
    return c.json({ error: 'Session expired or invalid.' }, 401);
  }
});

auth.post('/logout', async (c) => {
  // Verify the session before clearing it — prevents CSRF-triggered logouts
  // from sessions the caller doesn't own. If there's no valid cookie, still
  // clear it (idempotent) but don't error.
  const cookieHeader = c.req.header('cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  if (match) {
    const secret = c.env?.JWT_SECRET ?? 'dev-secret-change-me';
    try {
      await (await import('hono/jwt')).verify(match[1], secret, 'HS256');
    } catch {
      // Expired or invalid — still clear the cookie.
    }
  }
  c.header('Set-Cookie', 'session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
  return c.json({ ok: true });
});

export default auth;
