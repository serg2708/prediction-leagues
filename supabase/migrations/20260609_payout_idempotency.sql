-- CRIT-4: Add payout idempotency guard to leagues
-- onChainPayout now only fires if payout_tx_hash IS NULL (set atomically).
alter table leagues add column if not exists payout_tx_hash text;

-- HIGH-1: Add points_distributed guard to matches
-- award_points now only fires once per match.
alter table matches add column if not exists points_distributed boolean not null default false;
