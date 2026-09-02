import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { Keypair } from '@stellar/stellar-sdk';

/**
 * Expected shape of the message the client signs.
 * The client must JSON.stringify this and sign the UTF-8 bytes.
 *
 *   { address: "G...", timestamp: 1725271200000 }
 *
 * This lets us reject replays older than 5 minutes.
 */
interface SignedPayload {
  address: string;
  timestamp: number;
}

const auth = new Hono<{ Bindings: { JWT_SECRET: string } }>();

const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 minutes

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

  // ── 3. Confirm the address in the payload matches the claim ───
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
    const signatureBytes = Buffer.from(signedMessage, 'base64');
    isValid = keypair.verify(messageBytes, signatureBytes);
  } catch {
    // fromPublicKey throws if the address is not a valid Stellar public key
    return c.json({ error: 'Invalid Stellar address.' }, 400);
  }

  if (!isValid) {
    return c.json({ error: 'Signature verification failed.' }, 401);
  }

  // ── 6. Issue a JWT ────────────────────────────────────────────
  const secret = c.env?.JWT_SECRET ?? 'dev-secret-change-me';
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24 hours

  const token = await sign(
    {
      sub: address,
      exp: expiresAt,
    },
    secret,
  );

  return c.json({ token });
});

export default auth;
