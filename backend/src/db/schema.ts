import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  walletAddress: text('wallet_address').primaryKey(),
  handle: text('handle').unique(),
  avatar: text('avatar'),
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
