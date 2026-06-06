-- ─────────────────────────────────────────────────────────────
-- Security fixes migration
-- Run in Supabase Dashboard → SQL editor
-- ─────────────────────────────────────────────────────────────

-- ── H2: Restrict direct anon writes ──────────────────────────
-- All mutations go through server actions that use the service
-- role key (which bypasses RLS). Dropping permissive write
-- policies blocks any direct calls via the public anon key.

drop policy if exists "leagues_insert"      on leagues;
drop policy if exists "leagues_update"      on leagues;
drop policy if exists "members_insert"      on league_members;
drop policy if exists "predictions_insert"  on predictions;
drop policy if exists "predictions_update"  on predictions;
drop policy if exists "deposits_insert"     on deposits;
drop policy if exists "profiles_insert"     on profiles;

-- ── C4: Atomic pool increment ─────────────────────────────────
-- Used by joinLeagueAction to increment pool_usdc without
-- trusting a client-supplied current value.

create or replace function increment_pool(p_league_id uuid, p_amount numeric)
returns void language plpgsql security definer as $$
begin
  update leagues
  set pool_usdc = pool_usdc + p_amount
  where id = p_league_id;
end;
$$;
