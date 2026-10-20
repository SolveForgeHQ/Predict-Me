-- Price history snapshots for the odds chart.
-- One row per market per sync cycle. The frontend plots outcome_percents over time.
CREATE TABLE IF NOT EXISTS price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  market_key  TEXT    NOT NULL,   -- composite: "chain:marketId"  e.g. "sonic:4"
  chain       TEXT    NOT NULL,
  market_id   TEXT    NOT NULL,
  timestamp   INTEGER NOT NULL,   -- Unix ms
  pools       TEXT    NOT NULL,   -- JSON array of pool amounts, same order as outcomes
  total_pool  REAL    NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_price_history_market_key_ts
  ON price_history (market_key, timestamp);
