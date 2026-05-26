-- Add external_id and competition columns to matches for deduplication.
-- external_id: the ID from the source API (football-data, PandaScore, ESPN)
-- competition:  competition/tournament slug
-- The UNIQUE constraint on (league_id, external_id) makes upsert deduplication
-- work correctly — without it every "Sync matches" call inserts fresh duplicates.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS competition text;

-- Create the unique index only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'matches'
      AND indexname  = 'matches_league_id_external_id_key'
  ) THEN
    CREATE UNIQUE INDEX matches_league_id_external_id_key
      ON matches (league_id, external_id)
      WHERE external_id IS NOT NULL;
  END IF;
END;
$$;
