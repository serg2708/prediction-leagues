-- ─────────────────────────────────────────────────────────────
-- Prediction Leagues — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL editor)
-- ─────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Types ──────────────────────────────────────────────────
create type sport_type       as enum ('football', 'cs2', 'nba');
create type league_status    as enum ('pending', 'active', 'finished');
create type match_status     as enum ('upcoming', 'live', 'finished');
create type prediction_outcome as enum ('home', 'draw', 'away', 'team1', 'team2');

-- ── Profiles ───────────────────────────────────────────────
-- One row per wallet address; FID comes from Farcaster quick-auth.
create table profiles (
  id            text primary key,          -- wallet address (lowercase)
  fid           bigint unique,             -- Farcaster user ID
  display_name  text not null default '',
  avatar_url    text,
  created_at    timestamptz not null default now()
);

-- ── Leagues ────────────────────────────────────────────────
create table leagues (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  sport           sport_type not null,
  status          league_status not null default 'pending',
  entry_fee_usdc  numeric(10,2) not null default 10,
  pool_usdc       numeric(10,2) not null default 0,
  creator_id      text not null references profiles(id),
  invite_code     text not null unique default upper(substring(gen_random_uuid()::text, 1, 6)),
  created_at      timestamptz not null default now()
);

-- ── League members ─────────────────────────────────────────
create table league_members (
  league_id   uuid not null references leagues(id) on delete cascade,
  profile_id  text not null references profiles(id),
  points      int  not null default 0,
  paid        boolean not null default false,   -- USDC deposit confirmed
  joined_at   timestamptz not null default now(),
  primary key (league_id, profile_id)
);

-- ── Matches ────────────────────────────────────────────────
create table matches (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  team_home   text not null,
  team_away   text not null,
  sport       sport_type not null,
  starts_at   timestamptz not null,
  status      match_status not null default 'upcoming',
  score_home  int,
  score_away  int,
  result      prediction_outcome,    -- set after the match ends
  created_at  timestamptz not null default now()
);

-- ── Predictions ────────────────────────────────────────────
create table predictions (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references matches(id) on delete cascade,
  profile_id      text not null references profiles(id),
  outcome         prediction_outcome not null,
  points_awarded  int,               -- set when match result is recorded
  created_at      timestamptz not null default now(),
  unique (match_id, profile_id)      -- one prediction per player per match
);

-- ── On-chain deposits ──────────────────────────────────────
-- Stores the tx hash when a player deposits USDC to join a league
create table deposits (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id),
  profile_id  text not null references profiles(id),
  amount_usdc numeric(10,2) not null,
  tx_hash     text not null unique,
  confirmed   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Views
-- ─────────────────────────────────────────────────────────────

-- Leaderboard per league (ordered by points desc)
create view league_leaderboard as
select
  lm.league_id,
  lm.profile_id,
  p.display_name,
  p.avatar_url,
  lm.points,
  rank() over (partition by lm.league_id order by lm.points desc) as rank
from league_members lm
join profiles p on p.id = lm.profile_id;

-- ─────────────────────────────────────────────────────────────
-- Functions
-- ─────────────────────────────────────────────────────────────

-- Called after a match finishes: award 10 pts to correct predictions
create or replace function award_points(p_match_id uuid)
returns void language plpgsql as $$
declare
  v_result prediction_outcome;
  v_league_id uuid;
begin
  select result, league_id into v_result, v_league_id
  from matches where id = p_match_id;

  if v_result is null then
    raise exception 'Match % has no result set', p_match_id;
  end if;

  -- Mark correct predictions
  update predictions
  set points_awarded = 10
  where match_id = p_match_id and outcome = v_result;

  -- Mark wrong predictions
  update predictions
  set points_awarded = 0
  where match_id = p_match_id and outcome <> v_result;

  -- Roll points into league_members totals
  update league_members lm
  set points = points + coalesce(pr.points_awarded, 0)
  from predictions pr
  join matches m on m.id = pr.match_id
  where pr.match_id = p_match_id
    and pr.profile_id = lm.profile_id
    and m.league_id = lm.league_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────

alter table profiles       enable row level security;
alter table leagues        enable row level security;
alter table league_members enable row level security;
alter table matches        enable row level security;
alter table predictions    enable row level security;
alter table deposits       enable row level security;

-- Profiles: anyone can read; only own row writable
create policy "profiles_read"   on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (true);
create policy "profiles_update" on profiles for update using (auth.uid()::text = id);

-- Leagues: readable by members; insertable by authenticated users
create policy "leagues_read"   on leagues for select using (true);
create policy "leagues_insert" on leagues for insert with check (true);
create policy "leagues_update" on leagues for update using (true);

-- League members: readable by all; insert/update own rows
create policy "members_read"   on league_members for select using (true);
create policy "members_insert" on league_members for insert with check (true);

-- Matches: public read; only service role inserts/updates
create policy "matches_read" on matches for select using (true);

-- Predictions: readable by all; players manage own predictions
create policy "predictions_read"   on predictions for select using (true);
create policy "predictions_insert" on predictions for insert with check (true);
create policy "predictions_update" on predictions for update using (true);

-- Deposits: own rows only
create policy "deposits_read"   on deposits for select using (true);
create policy "deposits_insert" on deposits for insert with check (true);
