-- Step 1: Add external_id and competition columns if not already there
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS competition text;

-- Step 2: Delete duplicate matches — keep only the oldest row per (league_id, external_id)
DELETE FROM matches
WHERE id NOT IN (
  SELECT DISTINCT ON (league_id, external_id) id
  FROM matches
  WHERE external_id IS NOT NULL
  ORDER BY league_id, external_id, created_at ASC
);

-- Step 3: Add unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS matches_league_id_external_id_key
  ON matches (league_id, external_id)
  WHERE external_id IS NOT NULL;
