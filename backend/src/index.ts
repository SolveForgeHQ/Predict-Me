import { Hono } from 'hono';
import { cors } from 'hono/cors';
import markets from './routes/markets';
import auth from './routes/auth';
import usersRoute from './routes/users';

interface EnvBindings {
  FRONTEND_ORIGIN?: string;
  JWT_SECRET: string;
  DB?: D1Database;
}

const app = new Hono<{ Bindings: EnvBindings }>();

// ── CORS ─────────────────────────────────────────────────────
// credentials: true so the HttpOnly session cookie is sent cross-origin.
// origin is restricted to the configured frontend(s) — never wildcard.
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = (c.env?.FRONTEND_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim());
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

// ── Routes ───────────────────────────────────────────────────
app.route('/markets', markets);
app.route('/auth', auth);
app.route('/users', usersRoute);   // all /users/* require a valid session

export default app;
