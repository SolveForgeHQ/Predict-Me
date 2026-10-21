-- ── Leaderboard event tables ────────────────────────────────────────────────
--
-- indexer_state: one row per chain, tracks the last ingested block so the
--                indexer can resume from where it left off.
--
-- chain_events:  one row per on-chain log. Columns map directly to the six
--                events emitted by PredictionMarketERC20:
--
--   MarketCreated   → event_name='MarketCreated',  wallet=NULL,   outcome_index=NULL, amount=NULL
--   SharesBought    → event_name='SharesBought',   wallet=buyer,  outcome_index=outcomeIndex, amount=amount
--   MarketResolved  → event_name='MarketResolved', wallet=NULL,   outcome_index=winningOutcome, amount=NULL
--   MarketCancelled → event_name='MarketCancelled',wallet=NULL,   outcome_index=NULL, amount=NULL
--   WinningsClaimed → event_name='WinningsClaimed',wallet=claimer,outcome_index=NULL, amount=payout
--   Refunded        → event_name='Refunded',       wallet=user,   outcome_index=NULL, amount=amount
--
--   Amounts are stored as text strings of token base units (e.g. "1000000"
--   for 1 USDC at 6 decimals). Never floating point.

-- ── 1. Indexer state ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS indexer_state (
  chain       TEXT    NOT NULL PRIMARY KEY,  -- e.g. 'sonic', 'avalanche'
  last_block  INTEGER NOT NULL DEFAULT 0     -- last block number fully processed
);

-- ── 2. Chain events ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chain_events (
  id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  chain         TEXT    NOT NULL,            -- 'sonic' | 'avalanche' | 'stellar'
  tx_hash       TEXT    NOT NULL,            -- transaction hash (0x-prefixed)
  log_index     INTEGER NOT NULL,            -- log index within the transaction
  block_number  INTEGER NOT NULL,
  block_time    INTEGER NOT NULL,            -- Unix seconds
  event_name    TEXT    NOT NULL,            -- 'SharesBought' | 'WinningsClaimed' | etc.
  market_id     TEXT    NOT NULL,            -- string representation of uint256 marketId
  wallet        TEXT,                        -- buyer / claimer / user; NULL where not applicable
  outcome_index TEXT,                        -- string uint256 or NULL
  amount        TEXT,                        -- token base units as string, or NULL

  -- Prevent duplicate ingestion of the same log
  UNIQUE (chain, tx_hash, log_index)
);

-- ── 3. Indexes ───────────────────────────────────────────────────────────────

-- Look up all events of a given type on a chain (e.g. all SharesBought on sonic)
CREATE INDEX IF NOT EXISTS idx_chain_events_chain_event_name
  ON chain_events (chain, event_name);

-- Look up all events for a specific wallet (leaderboard, portfolio)
CREATE INDEX IF NOT EXISTS idx_chain_events_chain_wallet
  ON chain_events (chain, wallet);

-- Look up all events for a specific market
CREATE INDEX IF NOT EXISTS idx_chain_events_chain_market_id
  ON chain_events (chain, market_id);
