import type { League, Match, Prediction, LeagueMember } from "./types";

export const MOCK_MEMBERS: Record<string, LeagueMember[]> = {
  "1": [
    { league_id: "1", profile_id: "0xYou", points: 87, rank: 2, joined_at: "", profile: { id: "0xYou", display_name: "You", avatar_url: undefined } },
    { league_id: "1", profile_id: "0xAlex", points: 102, rank: 1, joined_at: "", profile: { id: "0xAlex", display_name: "alex.eth" } },
    { league_id: "1", profile_id: "0xMaria", points: 61, rank: 3, joined_at: "", profile: { id: "0xMaria", display_name: "maria" } },
    { league_id: "1", profile_id: "0xDan", points: 44, rank: 4, joined_at: "", profile: { id: "0xDan", display_name: "dan" } },
  ],
  "2": [
    { league_id: "2", profile_id: "0xYou", points: 112, rank: 1, joined_at: "", profile: { id: "0xYou", display_name: "You" } },
    { league_id: "2", profile_id: "0xLena", points: 95, rank: 2, joined_at: "", profile: { id: "0xLena", display_name: "lena.base" } },
  ],
  "3": [
    { league_id: "3", profile_id: "0xYou", points: 54, rank: 4, joined_at: "", profile: { id: "0xYou", display_name: "You" } },
    { league_id: "3", profile_id: "0xMax", points: 98, rank: 1, joined_at: "", profile: { id: "0xMax", display_name: "max" } },
    { league_id: "3", profile_id: "0xSoph", points: 81, rank: 2, joined_at: "", profile: { id: "0xSoph", display_name: "soph.eth" } },
    { league_id: "3", profile_id: "0xPete", points: 67, rank: 3, joined_at: "", profile: { id: "0xPete", display_name: "pete" } },
  ],
};

export const MOCK_MATCHES: Record<string, Match[]> = {
  "1": [
    { id: "m1", league_id: "1", team_home: "Man City", team_away: "Arsenal", sport: "football", starts_at: "2026-03-29T20:45:00Z", status: "upcoming", result: undefined },
    { id: "m2", league_id: "1", team_home: "Liverpool", team_away: "Chelsea", sport: "football", starts_at: "2026-03-30T17:30:00Z", status: "upcoming", result: undefined },
    { id: "m3", league_id: "1", team_home: "Real Madrid", team_away: "Barcelona", sport: "football", starts_at: "2026-03-28T21:00:00Z", status: "finished", score_home: 2, score_away: 1, result: "home" },
  ],
  "2": [
    { id: "m4", league_id: "2", team_home: "NAVI", team_away: "Vitality", sport: "cs2", starts_at: "2026-03-28T18:00:00Z", status: "live", result: undefined },
    { id: "m5", league_id: "2", team_home: "G2", team_away: "FaZe", sport: "cs2", starts_at: "2026-03-29T16:00:00Z", status: "upcoming", result: undefined },
  ],
  "3": [
    { id: "m6", league_id: "3", team_home: "Lakers", team_away: "Celtics", sport: "nba", starts_at: "2026-03-29T02:30:00Z", status: "upcoming", result: undefined },
    { id: "m7", league_id: "3", team_home: "Warriors", team_away: "Bucks", sport: "nba", starts_at: "2026-03-30T01:00:00Z", status: "upcoming", result: undefined },
  ],
};

export const MOCK_PREDICTIONS: Record<string, Prediction[]> = {
  "m3": [
    { id: "p1", match_id: "m3", profile_id: "0xYou", outcome: "home", points_awarded: 10, created_at: "" },
  ],
};

export const MOCK_LEAGUES: League[] = [
  { id: "1", name: "Alpha Squad",       sport: "football", status: "active", pool_usdc: 160, entry_fee_usdc: 20, creator_id: "0xAlex", invite_code: "ALPHA1", created_at: "", is_public: true, min_players: 2 },
  { id: "2", name: "CS2 Degenerates",   sport: "cs2",      status: "active", pool_usdc: 50,  entry_fee_usdc: 10, creator_id: "0xYou",  invite_code: "CS2DG2", created_at: "", is_public: true, min_players: 2 },
  { id: "3", name: "Hoops Gang",        sport: "nba",      status: "active", pool_usdc: 200, entry_fee_usdc: 40, creator_id: "0xMax",  invite_code: "HOOPS3", created_at: "", is_public: true, min_players: 2 },
  { id: "4", name: "Work Friends",      sport: "football", status: "active", pool_usdc: 80,  entry_fee_usdc: 20, creator_id: "0xYou",  invite_code: "WORK44", created_at: "", is_public: false, min_players: 3 },
];
