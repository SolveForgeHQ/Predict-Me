-- Add resolution_criteria column for Sonic markets (and any future chain that uses it)
ALTER TABLE market_cache ADD COLUMN resolution_criteria TEXT;
