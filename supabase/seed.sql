-- ─────────────────────────────────────────────────────────────
-- Prediction Leagues — seed data for local development
-- Run AFTER schema.sql and notification_tokens.sql
-- ─────────────────────────────────────────────────────────────

-- Profiles
insert into profiles (id, display_name, fid) values
  ('0xyou',   'You',        12345),
  ('0xalex',  'alex.eth',   22222),
  ('0xmaria', 'maria',      33333),
  ('0xdan',   'dan',        44444),
  ('0xlena',  'lena.base',  55555),
  ('0xmax',   'max',        66666),
  ('0xsoph',  'soph.eth',   77777),
  ('0xpete',  'pete',       88888)
on conflict (id) do nothing;

-- Leagues
insert into leagues (id, name, sport, status, entry_fee_usdc, pool_usdc, creator_id, invite_code) values
  ('00000000-0000-0000-0000-000000000001', 'Alpha Squad',      'football', 'active',   20, 160, '0xalex',  'ALPHA1'),
  ('00000000-0000-0000-0000-000000000002', 'CS2 Degenerates',  'cs2',      'active',   10,  50, '0xyou',   'CS2DG2'),
  ('00000000-0000-0000-0000-000000000003', 'Hoops Gang',       'nba',      'active',   40, 200, '0xmax',   'HOOPS3'),
  ('00000000-0000-0000-0000-000000000004', 'Work Friends',     'football', 'active',   20,  80, '0xyou',   'WORK44')
on conflict (id) do nothing;

-- League members
insert into league_members (league_id, profile_id, points, paid) values
  ('00000000-0000-0000-0000-000000000001', '0xyou',   87,  true),
  ('00000000-0000-0000-0000-000000000001', '0xalex',  102, true),
  ('00000000-0000-0000-0000-000000000001', '0xmaria', 61,  true),
  ('00000000-0000-0000-0000-000000000001', '0xdan',   44,  true),
  ('00000000-0000-0000-0000-000000000002', '0xyou',   112, true),
  ('00000000-0000-0000-0000-000000000002', '0xlena',  95,  true),
  ('00000000-0000-0000-0000-000000000003', '0xyou',   54,  true),
  ('00000000-0000-0000-0000-000000000003', '0xmax',   98,  true),
  ('00000000-0000-0000-0000-000000000003', '0xsoph',  81,  true),
  ('00000000-0000-0000-0000-000000000003', '0xpete',  67,  true),
  ('00000000-0000-0000-0000-000000000004', '0xyou',   33,  true),
  ('00000000-0000-0000-0000-000000000004', '0xalex',  71,  true),
  ('00000000-0000-0000-0000-000000000004', '0xmaria', 58,  true),
  ('00000000-0000-0000-0000-000000000004', '0xdan',   22,  true)
on conflict do nothing;

-- Matches
insert into matches (id, league_id, team_home, team_away, sport, starts_at, status, score_home, score_away, result) values
  -- League 1 – Football
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Man City',    'Arsenal',   'football', now() + interval '1 day',    'upcoming', null, null, null),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Liverpool',   'Chelsea',   'football', now() + interval '2 days',   'upcoming', null, null, null),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Real Madrid', 'Barcelona', 'football', now() - interval '1 hour',   'finished', 2,    1,    'home'),
  -- League 2 – CS2
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'NAVI',        'Vitality',  'cs2',      now(),                        'live',     null, null, null),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'G2',          'FaZe',      'cs2',      now() + interval '1 day',    'upcoming', null, null, null),
  -- League 3 – NBA
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'Lakers',      'Celtics',   'nba',      now() + interval '1 day',    'upcoming', null, null, null),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'Warriors',    'Bucks',     'nba',      now() + interval '2 days',   'upcoming', null, null, null),
  -- League 4 – Football
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000004', 'PSG',         'Bayern',    'football', now() - interval '2 hours',  'finished', 1,    2,    'away')
on conflict (id) do nothing;

-- Predictions (for 0xyou)
insert into predictions (match_id, profile_id, outcome, points_awarded) values
  ('10000000-0000-0000-0000-000000000003', '0xyou', 'home', 10),
  ('10000000-0000-0000-0000-000000000008', '0xyou', 'home',  0)
on conflict (match_id, profile_id) do nothing;
