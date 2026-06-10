-- #4: Indexes for hot query paths. Only PKs/unique constraints existed
-- before, so several frequent filters did sequential scans. These cover the
-- real query shapes seen in the app and crons.

-- "My leagues" / discover membership lookups filter by profile_id, but the
-- league_members PK is (league_id, profile_id) — profile_id alone isn't indexed.
create index if not exists idx_league_members_profile
  on league_members (profile_id);

-- usePredictions / profile page filter predictions by profile_id; the unique
-- (match_id, profile_id) indexes match_id first, so profile_id alone scans.
create index if not exists idx_predictions_profile
  on predictions (profile_id);

-- Per-league match listing (admin, league page) and existence checks order by
-- starts_at within a league.
create index if not exists idx_matches_league_starts
  on matches (league_id, starts_at);

-- update-results poll + abandon sweep scan globally by status and start time.
create index if not exists idx_matches_status_starts
  on matches (status, starts_at);

-- PandaScore webhook + cross-league result fan-out look matches up by external_id.
create index if not exists idx_matches_external
  on matches (external_id);

-- deposits FK isn't auto-indexed; delete-league and create-league hit it by league_id.
create index if not exists idx_deposits_league
  on deposits (league_id);

-- Finalise/sync crons scan leagues by status; discover lists public, non-finished.
create index if not exists idx_leagues_status
  on leagues (status);
create index if not exists idx_leagues_discover
  on leagues (is_public, created_at);
