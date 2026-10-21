/**
 * routes/users.ts
 *
 * All routes require a valid session cookie (enforced by requireAuth).
 * The wallet address comes from the verified JWT — never from the request body.
 *
 * Optimistic concurrency on PUT /users/me:
 *   - GET returns the current `version` number alongside profile fields.
 *   - PUT must include `{ version: <number> }` matching the last-read version.
 *   - The UPDATE is conditional: WHERE wallet_address = ? AND version = ?
 *     If 0 rows are affected (version mismatch), return 409 Conflict.
 *   - On success, version is atomically incremented by the DB.
 *
 * Routes:
 *   GET  /users/me      — profile + current version
 *   PUT  /users/me      — update handle/avatar with version check
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import { users } from '../db/schema';
import { requireAuth } from '../middleware/auth';

interface EnvBindings {
  DB?: D1Database;
  JWT_SECRET: string;
}

type UserProfile = {
  walletAddress: string;
  handle: string | null;
  avatar: string | null;
  version: number;
};

const usersRoute = new Hono<{ Bindings: EnvBindings; Variables: { walletAddress: string } }>();

usersRoute.use('*', requireAuth);

// ── GET /users/me ────────────────────────────────────────────
usersRoute.get('/me', async (c) => {
  const address = c.get('walletAddress');

  if (!c.env?.DB) {
    return c.json<UserProfile>({ walletAddress: address, handle: null, avatar: null, version: 0 });
  }

  const db = drizzle(c.env.DB);

  // Atomic upsert-on-first-visit then return — single round trip.
  // INSERT OR IGNORE seeds the row; the SELECT always reads the current state.
  await (c.env.DB as D1Database)
    .prepare('INSERT OR IGNORE INTO users (wallet_address, version) VALUES (?, 0)')
    .bind(address)
    .run();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, address))
    .limit(1);

  return c.json<UserProfile>({
    walletAddress: user.walletAddress,
    handle: user.handle ?? null,
    avatar: user.avatar ?? null,
    version: user.version ?? 0,
  });
});

// ── PUT /users/me ────────────────────────────────────────────
usersRoute.put('/me', async (c) => {
  const address = c.get('walletAddress');

  let body: { handle?: unknown; avatar?: unknown; version?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body.' }, 400);
  }

  // ── version is required for optimistic concurrency ──────────
  if (body.version === undefined || typeof body.version !== 'number' || !Number.isInteger(body.version)) {
    return c.json({ error: 'version (integer) is required. Read GET /users/me first to get the current version.' }, 400);
  }
  const clientVersion = body.version as number;

  // ── Validate handle ──────────────────────────────────────────
  let newHandle: string | null | undefined;
  if (body.handle !== undefined) {
    if (typeof body.handle !== 'string') {
      return c.json({ error: 'handle must be a string.' }, 400);
    }
    const handle = body.handle.trim();
    if (handle.length > 32) {
      return c.json({ error: 'handle must be 32 characters or fewer.' }, 400);
    }
    if (handle.length > 0 && !/^[a-zA-Z0-9_.-]+$/.test(handle)) {
      return c.json({ error: 'handle may only contain letters, numbers, underscores, hyphens, and dots.' }, 400);
    }
    newHandle = handle || null;
  }

  // ── Validate avatar ──────────────────────────────────────────
  let newAvatar: string | null | undefined;
  if (body.avatar !== undefined && body.avatar !== null) {
    if (typeof body.avatar !== 'string') {
      return c.json({ error: 'avatar must be a string URL or null.' }, 400);
    }
    if (!body.avatar.startsWith('https://')) {
      return c.json({ error: 'avatar must be an https:// URL.' }, 400);
    }
    if (body.avatar.length > 512) {
      return c.json({ error: 'avatar URL is too long (max 512 chars).' }, 400);
    }
    newAvatar = body.avatar;
  } else if (body.avatar === null) {
    newAvatar = null;
  }

  if (!c.env?.DB) {
    return c.json({ error: 'Database not available.' }, 503);
  }

  // ── Atomic conditional update with version check ─────────────
  // Build the SET clause from only the fields the client sent.
  const setClauses: string[] = ['version = version + 1'];
  const bindings: (string | null)[] = [];

  if (newHandle !== undefined) {
    setClauses.push('handle = ?');
    bindings.push(newHandle);
  }
  if (newAvatar !== undefined) {
    setClauses.push('avatar = ?');
    bindings.push(newAvatar);
  }

  if (setClauses.length === 1) {
    // Only version increment — no fields to update.
    return c.json({ error: 'No fields to update. Provide handle and/or avatar.' }, 400);
  }

  // Append WHERE bindings
  bindings.push(address, String(clientVersion));

  const updateSql = `
    UPDATE users
    SET ${setClauses.join(', ')}
    WHERE wallet_address = ? AND version = ?
  `;

  let result: D1Result;
  try {
    result = await (c.env.DB as D1Database)
      .prepare(updateSql)
      .bind(...bindings)
      .run();
  } catch (err: any) {
    // SQLite UNIQUE constraint on handle
    if (
      typeof err?.message === 'string' &&
      err.message.includes('UNIQUE constraint failed: users.handle')
    ) {
      return c.json({ error: 'That handle is already taken. Please choose a different one.' }, 409);
    }
    throw err;
  }

  // rows_written === 0 means the version didn't match — concurrent update
  if ((result.meta?.rows_written ?? (result as any).changes ?? 0) === 0) {
    return c.json(
      {
        error: 'Conflict: the profile was updated by another request. Re-fetch GET /users/me and retry with the latest version.',
        code: 'VERSION_CONFLICT',
      },
      409,
    );
  }

  // ── Return the new state atomically ──────────────────────────
  const [updated] = await drizzle(c.env.DB)
    .select()
    .from(users)
    .where(eq(users.walletAddress, address))
    .limit(1);

  return c.json<UserProfile>({
    walletAddress: updated.walletAddress,
    handle: updated.handle ?? null,
    avatar: updated.avatar ?? null,
    version: updated.version ?? 0,
  });
});

export default usersRoute;
