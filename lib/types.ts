export type Sport = "football" | "cs2" | "nba";
export type LeagueStatus = "active" | "finished" | "pending";
export type MatchStatus = "upcoming" | "live" | "finished";
export type PredictionOutcome = "home" | "draw" | "away" | "team1" | "team2";

export interface Profile {
  id: string; // wallet address
  fid?: number; // Farcaster ID
  display_name: string;
  avatar_url?: string;
}

export interface League {
  id: string;
  name: string;
  sport: Sport;
  status: LeagueStatus;
  pool_usdc: number;
  entry_fee_usdc: number;
  creator_id: string;
  invite_code: string;
  created_at: string;
  ends_at: string | null;
  competition_id?: string;
  is_public: boolean;
  min_players: number;
  needs_refund?: boolean;
  members?: LeagueMember[];
}

export interface LeagueMember {
  league_id: string;
  profile_id: string;
  points: number;
  rank: number;
  joined_at: string;
  profile?: Profile;
}

export interface Match {
  id: string;
  league_id: string;
  team_home: string;
  team_away: string;
  sport: Sport;
  starts_at: string;
  status: MatchStatus;
  score_home?: number;
  score_away?: number;
  result?: PredictionOutcome;
}

export interface Prediction {
  id: string;
  match_id: string;
  profile_id: string;
  outcome: PredictionOutcome;
  points_awarded?: number;
  created_at: string;
}
