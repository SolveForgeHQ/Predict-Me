import { Hono } from 'hono';
import { cors } from 'hono/cors';
import markets from './routes/markets';
import auth from './routes/auth';
import usersRoute from './routes/users';
import { runSonicIndexer } from './indexer/sonic';

interface EnvBindings {
  FRONTEND_ORIGIN?:        string;
  JWT_SECRET:              string;
  DB?:                     D1Database;
  SONIC_RPC_URL?:          string;
  SONIC_CONTRACT_ADDRESS?: string;
  SONIC_START_BLOCK?:      string;
}

const app = new Hono<{ Bindings: EnvBindings }>();

// ── CORS ─────────────────────────────────────────────────────
// credentials: true so the HttpOnly session cookie is sent cross-origin.
// origin is restricted to the configured frontend(s) — never wildcard.
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = (c.env?.FRONTEND_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((o: string) => o.trim());
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
}));

// ── Rate limiting on auth ────────────────────────────────────
// Simple in-memory sliding window: max 10 login attempts per IP per minute.
// Resets on Worker restart (stateless, no KV required).
const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

app.use('/auth/login', async (c, next) => {
  if (c.req.method !== 'POST') return next();

  const ip =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown';

  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && now - entry.windowStart < LOGIN_WINDOW_MS) {
    entry.count++;
    if (entry.count > LOGIN_LIMIT) {
      return c.json(
        { error: 'Too many login attempts. Please wait a minute and try again.' },
        429,
      );
    }
  } else {
    loginAttempts.set(ip, { count: 1, windowStart: now });
  }

  return next();
});

// ── Health ───────────────────────────────────────────────────
app.get('/health', (c) => c.text('OK'));

// ── Debug: event counts (dev only) ───────────────────────────
app.get('/debug/events', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'no DB' }, 500);
  const rows = await (c.env.DB as D1Database)
    .prepare('SELECT event_name, COUNT(*) as count FROM chain_events GROUP BY event_name ORDER BY count DESC')
    .all();
  const state = await (c.env.DB as D1Database)
    .prepare('SELECT * FROM indexer_state')
    .all();
  return c.json({ events: rows.results, indexer_state: state.results });
});

// ── Routes ───────────────────────────────────────────────────
app.route('/markets', markets);
app.route('/auth', auth);
app.route('/users', usersRoute);   // all /users/* require a valid session

// ── Cron handler — Cloudflare Scheduled Worker ───────────────
// Triggered every minute via the schedule in wrangler.toml.
// Also callable directly from tests via `scheduled(event, env, ctx)`.
const scheduled: ExportedHandlerScheduledHandler<EnvBindings> = async (_event, env, _ctx) => {
  if (!env.DB) {
    console.warn('[cron] D1 binding not available — skipping indexer');
    return;
  }
  try {
    const result = await runSonicIndexer({
      DB:                    env.DB,
      SONIC_RPC_URL:         env.SONIC_RPC_URL,
      SONIC_CONTRACT_ADDRESS:env.SONIC_CONTRACT_ADDRESS,
      SONIC_START_BLOCK:     env.SONIC_START_BLOCK,
    });
    if (result.skipped) {
      console.log('[indexer] Already up to date — nothing to do');
    } else {
      console.log(
        `[indexer] Done — ranges=${result.rangesProcessed} ` +
        `decoded=${result.logsDecoded} inserted=${result.rowsInserted} ` +
        `blocks=${result.fromBlock}→${result.toBlock}`,
      );
    }
  } catch (err) {
    console.error('[indexer] Unhandled error:', err);
  }
};

export default { ...app, scheduled } as ExportedHandler<EnvBindings>;
