-- ── Fix: award_points needs SECURITY DEFINER to update tables ────
-- Without SECURITY DEFINER, the function runs as the calling role
-- (service_role via PostgREST), which may not have BYPASSRLS
-- at the PostgreSQL level. SECURITY DEFINER makes it run as
-- the function owner (postgres superuser) with full access.

create or replace function award_points(p_match_id uuid)
returns void language plpgsql security definer as $$
declare
  v_result prediction_outcome;
  v_league_id uuid;
  v_claimed int;
begin
  -- HIGH-1: Idempotency guard — claim this match atomically
  update matches
  set points_distributed = true
  where id = p_match_id and points_distributed = false;
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    return; -- already distributed, skip silently
  end if;

  select result, league_id into v_result, v_league_id
  from matches where id = p_match_id;

  if v_result is null then
    raise exception 'Match % has no result set', p_match_id;
  end if;

  update predictions
  set points_awarded = 10
  where match_id = p_match_id and outcome = v_result;

  update predictions
  set points_awarded = 0
  where match_id = p_match_id and outcome <> v_result;

  update league_members lm
  set points = points + coalesce(pr.points_awarded, 0)
  from predictions pr
  join matches m on m.id = pr.match_id
  where pr.match_id = p_match_id
    and pr.profile_id = lm.profile_id
    and m.league_id = lm.league_id;
end;
$$;

-- ── Fix: increment_pool also needs SECURITY DEFINER ───────────────
create or replace function increment_pool(p_league_id uuid, p_amount numeric)
returns void language plpgsql security definer as $$
begin
  update leagues set pool_usdc = pool_usdc + p_amount where id = p_league_id;
end;
$$;
