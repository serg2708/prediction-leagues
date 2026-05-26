-- Add ends_at to leagues
-- Run in Supabase SQL editor.
-- Existing leagues get a default of 30 days from creation date.

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

UPDATE leagues
  SET ends_at = created_at + interval '30 days'
  WHERE ends_at IS NULL;
