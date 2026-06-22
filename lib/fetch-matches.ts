export type MatchRow = {
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

type NbaCompetitor = {
  homeAway: "home" | "away";
  score?: string;
  team: { shortDisplayName: string; displayName: string };
};

type NbaCompetition = {
  competitors: NbaCompetitor[];
  status: { type: { state: string; completed: boolean } };
};

type NbaEvent = {
  id: string;
  date: string;
  competitions: NbaCompetition[];
};

const ALLOWED_FOOTBALL_COMPETITIONS = new Set([
  "WC", "CL", "PL", "PD", "SA", "BL1", "FL1", "PPL", "DED", "EC",
]);

export async function fetchFootballMatches(competition = "PL"): Promise<MatchRow[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY not set");
  if (!ALLOWED_FOOTBALL_COMPETITIONS.has(competition)) {
    throw new Error(`Unknown football competition: ${competition}`);
  }

  const res = await fetch(
    `https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/matches?status=SCHEDULED`,
    { headers: { "X-Auth-Token": apiKey } }
  );
  if (!res.ok) throw new Error(`football-data.org error: ${res.status}`);
  const json = (await res.json()) as { matches: FootballMatch[] };

  return json.matches
    // Cup knockout fixtures can be scheduled before teams are decided
    // (homeTeam/awayTeam name is null) — skip them so the NOT NULL upsert
    // doesn't reject the whole batch. They get picked up once teams are set.
    .filter((m) => (m.homeTeam?.shortName ?? m.homeTeam?.name) && (m.awayTeam?.shortName ?? m.awayTeam?.name))
    .slice(0, 50)
    .map((m) => ({
      team_home:   m.homeTeam.shortName ?? m.homeTeam.name,
      team_away:   m.awayTeam.shortName ?? m.awayTeam.name,
      sport:       "football" as const,
      starts_at:   m.utcDate,
      status:      "upcoming" as const,
      external_id: String(m.id),
      competition,
    }));
}

export async function fetchCs2Matches(tournament?: string): Promise<MatchRow[]> {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) throw new Error("PANDASCORE_API_KEY not set");

  const url = tournament
    ? `https://api.pandascore.co/csgo/tournaments/${encodeURIComponent(tournament)}/matches?per_page=20&sort=begin_at`
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

// Public ESPN API — no key required, supports historical dates
export async function fetchNbaScoreboard(dateStr: string): Promise<NbaEvent[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`
  );
  if (!res.ok) throw new Error(`ESPN NBA error: ${res.status}`);
  const json = (await res.json()) as { events: NbaEvent[] };
  return json.events ?? [];
}

export async function fetchNbaMatches(): Promise<MatchRow[]> {
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0].replace(/-/g, ""));
  }

  const settled = await Promise.allSettled(dates.map((d) => fetchNbaScoreboard(d)));
  const allEvents = settled
    .filter((r): r is PromiseFulfilledResult<NbaEvent[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  return allEvents
    .filter((e) => e.competitions[0]?.status?.type?.state !== "post")
    .map((e) => {
      const comp = e.competitions[0];
      const home = comp?.competitors.find((c) => c.homeAway === "home");
      const away = comp?.competitors.find((c) => c.homeAway === "away");
      return {
        team_home:   home?.team.shortDisplayName ?? home?.team.displayName ?? "TBD",
        team_away:   away?.team.shortDisplayName ?? away?.team.displayName ?? "TBD",
        sport:       "nba" as const,
        starts_at:   e.date,
        status:      "upcoming" as const,
        external_id: e.id,
        competition: "nba",
      };
    })
    .filter((m) => m.team_home !== "TBD");
}
