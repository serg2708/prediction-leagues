/**
 * Admin endpoint — fetch real upcoming matches and insert into a league.
 *
 * POST /api/admin/sync-matches
 * Headers: Authorization: Bearer <ADMIN_SECRET>
 * Body: { league_id: string, sport: "football" | "cs2" | "nba", competition?: string }
 *
 * football competitions: PL (Premier League), CL (Champions League),
 *   BL1 (Bundesliga), SA (Serie A), PD (La Liga), FL1 (Ligue 1)
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

type MatchRow = {
  team_home:   string;
  team_away:   string;
  sport:       "football" | "cs2" | "nba";
  starts_at:   string;
  status:      "upcoming";
  external_id: string;
  competition: string;
};

type FootballMatch = {
  id: number;
  utcDate: string;
  homeTeam: { shortName?: string; name: string };
  awayTeam: { shortName?: string; name: string };
};

type PandaOpponent = { opponent: { name: string } };
type PandaMatch = {
  id: number;
  opponents?: PandaOpponent[];
  begin_at?: string;
  scheduled_at?: string;
};

type NbaGame = {
  id: number;
  teams: { home: { name: string }; visitors: { name: string } };
  date: { start: string };
};

// ── Football (football-data.org) ──────────────────────────────────────────────

async function fetchFootballMatches(competition = "PL"): Promise<MatchRow[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY not set");

  const res = await fetch(
    `https://api.football-data.org/v4/competitions/${competition}/matches?status=SCHEDULED`,
    { headers: { "X-Auth-Token": apiKey } }
  );
  if (!res.ok) throw new Error(`football-data.org error: ${res.status}`);
  const json = (await res.json()) as { matches: FootballMatch[] };

  return json.matches.slice(0, 10).map((m) => ({
    team_home:   m.homeTeam.shortName ?? m.homeTeam.name,
    team_away:   m.awayTeam.shortName ?? m.awayTeam.name,
    sport:       "football" as const,
    starts_at:   m.utcDate,
    status:      "upcoming" as const,
    external_id: String(m.id),
    competition,
  }));
}

// ── CS2 (PandaScore — free tier: 1000 req/hour) ──────────────────────────────

async function fetchCs2Matches(tournament?: string): Promise<MatchRow[]> {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) throw new Error("PANDASCORE_API_KEY not set");

  // If tournament slug provided — fetch matches for that specific tournament
  // Find slug via: GET https://api.pandascore.co/csgo/tournaments?search[name]=BLAST
  const url = tournament
    ? `https://api.pandascore.co/csgo/tournaments/${tournament}/matches?per_page=20&sort=begin_at`
    : "https://api.pandascore.co/csgo/matches/upcoming?per_page=10&sort=begin_at";

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`PandaScore error: ${res.status}`);
  const json = (await res.json()) as PandaMatch[];

  return json
    .map((m) => {
      const [t1, t2] = m.opponents ?? [];
      return {
        team_home:   t1?.opponent?.name ?? "TBD",
        team_away:   t2?.opponent?.name ?? "TBD",
        sport:       "cs2" as const,
        starts_at:   (m.begin_at ?? m.scheduled_at) as string,
        status:      "upcoming" as const,
        external_id: String(m.id),
        competition: "csgo",
      };
    })
    .filter((m) => m.team_home !== "TBD" && m.starts_at);
}

// ── NBA (api-nba via RapidAPI) ────────────────────────────────────────────────

async function fetchNbaMatches(): Promise<MatchRow[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error("RAPIDAPI_KEY not set — get a free key at rapidapi.com and subscribe to api-nba");

  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(
    `https://api-nba-v1.p.rapidapi.com/games?date=${today}`,
    {
      headers: {
        "x-rapidapi-host": "api-nba-v1.p.rapidapi.com",
        "x-rapidapi-key":  apiKey,
      },
    }
  );
  if (!res.ok) throw new Error(`api-nba error: ${res.status}`);
  const json = (await res.json()) as { response: NbaGame[] };

  return json.response.map((g) => ({
    team_home:   g.teams.home.name,
    team_away:   g.teams.visitors.name,
    sport:       "nba" as const,
    starts_at:   g.date.start,
    status:      "upcoming" as const,
    external_id: String(g.id),
    competition: "nba",
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { league_id?: string; sport?: string; competition?: string; tournament?: string };
  const { league_id, sport, competition, tournament } = body;

  if (!league_id || !sport) {
    return NextResponse.json({ error: "league_id and sport are required" }, { status: 400 });
  }

  let matches: MatchRow[];

  try {
    if (sport === "football") {
      matches = await fetchFootballMatches(competition ?? "PL");
    } else if (sport === "cs2") {
      matches = await fetchCs2Matches(tournament);
    } else if (sport === "nba") {
      matches = await fetchNbaMatches();
    } else {
      return NextResponse.json({ error: `Sport "${sport}" not supported` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch matches" },
      { status: 502 }
    );
  }

  if (!matches.length) {
    return NextResponse.json({ ok: true, inserted: 0, message: "No upcoming matches found" });
  }

  const rows = matches.map((m) => ({ ...m, league_id }));
  const { error } = await supabase.from("matches").insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
