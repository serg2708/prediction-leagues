-- #1: Enforce min_players. A league that finishes without reaching its
-- minimum player count must NOT pay a winner the pool — it's voided and
-- flagged for refund instead. This column makes that state explicit and
-- lets the refund flow (and admin UI) find leagues that owe money back.

alter table leagues add column if not exists needs_refund boolean not null default false;

-- Find leagues awaiting refund quickly
create index if not exists idx_leagues_needs_refund on leagues (needs_refund) where needs_refund;
