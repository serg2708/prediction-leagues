-- #3: Handle stuck leagues. A match whose external result never resolves
-- (phantom fixtures, off-season ghosts, delisted games) would sit in
-- 'upcoming' forever and block its league from ever finalising. Add an
-- 'abandoned' terminal status so the result poller can retire such matches,
-- unblocking finalisation.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction and the new
-- value can't be used in the same statement batch — run this on its own.

alter type match_status add value if not exists 'abandoned';
