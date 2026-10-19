-- predict-me D1 schema

CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  handle TEXT UNIQUE,
  avatar TEXT
);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT,
  rank INTEGER,
  score REAL,
  timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  reward INTEGER
);

CREATE TABLE IF NOT EXISTS market_cache (
  id TEXT PRIMARY KEY,
  market_id TEXT,
  chain TEXT NOT NULL DEFAULT 'stellar',
  question TEXT NOT NULL,
  category TEXT,
  end_time INTEGER NOT NULL,
  status TEXT NOT NULL,
  outcomes TEXT NOT NULL DEFAULT '["YES","NO"]',
  pools TEXT NOT NULL DEFAULT '[0,0]',
  resolved_outcome_index INTEGER,
  yes_pool REAL DEFAULT 0,
  no_pool REAL DEFAULT 0,
  resolved_outcome TEXT,
  updated_at INTEGER NOT NULL
);
