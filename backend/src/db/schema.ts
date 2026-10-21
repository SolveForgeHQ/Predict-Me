import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  walletAddress: text('wallet_address').primaryKey(),
  handle: text('handle').unique(),
  avatar: text('avatar'),
  /**
   * Optimistic concurrency version counter.
   * Clients read this value and must echo it back on PUT /users/me.
   * The update is a no-op (0 rows affected) if the version has changed,
   * which the handler translates into a 409 Conflict response.
   */
  version: integer('version').notNull().default(0),
});

export const leaderboardSnapshots = sqliteTable('leaderboard_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  walletAddress: text('wallet_address'),
  rank: integer('rank'),
  score: real('score'),
  timestamp: integer('timestamp'),
});

export const quests = sqliteTable('quests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title'),
  description: text('description'),
  reward: integer('reward'),
});

export const marketCache = sqliteTable('market_cache', {
  id: text('id').primaryKey(),
  marketId: text('market_id'),
  chain: text('chain').notNull().default('stellar'),
  question: text('question').notNull(),
  category: text('category'),
  endTime: integer('end_time').notNull(),
  status: text('status').notNull(),
  outcomes: text('outcomes').notNull().default('["YES","NO"]'),
  pools: text('pools').notNull().default('[0,0]'),
  resolvedOutcomeIndex: integer('resolved_outcome_index'),
  resolutionCriteria: text('resolution_criteria'),
  // ── Deprecated binary columns (populated when outcomes.length === 2) ──
  yesPool: real('yes_pool').default(0),
  noPool: real('no_pool').default(0),
  resolvedOutcome: text('resolved_outcome'),
  updatedAt: integer('updated_at').notNull(),
});

export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  marketKey: text('market_key').notNull(),
  chain: text('chain').notNull(),
  marketId: text('market_id').notNull(),
  timestamp: integer('timestamp').notNull(),
  pools: text('pools').notNull(),
  totalPool: real('total_pool').notNull().default(0),
}, (t) => ({
  // Unique on (market_key, pools) — prevents duplicate snapshots when two
  // Worker instances sync simultaneously and both see the same pool state.
  uniqSnapshot: unique('price_history_market_key_pools_unique').on(t.marketKey, t.pools),
}));

/**
 * Server-side session registry.
 * Each row represents one active login event keyed by jti (JWT ID).
 * Used as the source of truth for idempotent login and future revocation.
 *
 * The INSERT is done with ON CONFLICT DO NOTHING so two concurrent login
 * requests with the same jti only produce one row — atomically.
 */
export const sessions = sqliteTable('sessions', {
  jti: text('jti').primaryKey(),          // sha-256 of (address:sig:ts)
  walletAddress: text('wallet_address').notNull(),
  issuedAt: integer('issued_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
