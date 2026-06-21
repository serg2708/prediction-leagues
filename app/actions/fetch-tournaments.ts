"use server";

export type Tournament = {
  id: string;
  name: string;
  meta?: string; // country / league / season
};

// Curated major football competitions only (no minor leagues). World Cup first
// — it's the marquee event and the only one live during the summer off-season.
const FOOTBALL_COMPETITIONS: Tournament[] = [
  { id: "WC",  name: "World Cup 2026",    meta: "🌍 International" },
  { id: "CL",  name: "Champions League",  meta: "🇪🇺 Europe" },
  { id: "PL",  name: "Premier League",    meta: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 England" },
  { id: "PD",  name: "La Liga",           meta: "🇪🇸 Spain" },
  { id: "SA",  name: "Serie A",           meta: "🇮🇹 Italy" },
  { id: "BL1", name: "Bundesliga",        meta: "🇩🇪 Germany" },
  { id: "FL1", name: "Ligue 1",           meta: "🇫🇷 France" },
];

// Marquee NBA events only.
const NBA_TOURNAMENTS: Tournament[] = [
  { id: "nba-finals-2026",   name: "NBA Finals",      meta: "2025–26" },
  { id: "nba-playoffs-2026", name: "NBA Playoffs",    meta: "2025–26" },
  { id: "nba-cup-2026",      name: "NBA Cup",         meta: "In-season tournament" },
  { id: "nba-2026",          name: "Regular Season",  meta: "2025–26" },
];

// PandaScore tournament tiers we consider "major". S = premier (Majors, IEM
// Katowice/Cologne, BLAST finals), A = top-tier (ESL Pro League, big regionals).
const MAJOR_CS2_TIERS = new Set(["s", "a"]);

type PandaTournament = {
  id: number;
  name: string;
  slug: string;
  tier?: string | null;
  league?: { name: string };
  serie?: { full_name?: string };
  begin_at?: string;
};

export async function fetchTournaments(sport: string): Promise<Tournament[]> {
  if (sport === "football") return FOOTBALL_COMPETITIONS;
  if (sport === "nba") return NBA_TOURNAMENTS;

  if (sport === "cs2") {
    try {
      const apiKey = process.env.PANDASCORE_API_KEY;
      if (!apiKey) return [];

      const [r1, r2] = await Promise.all([
        fetch("https://api.pandascore.co/csgo/tournaments/running?per_page=50&sort=begin_at", {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetch("https://api.pandascore.co/csgo/tournaments/upcoming?per_page=50&sort=begin_at", {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      ]);

      const running  = r1.ok ? ((await r1.json()) as PandaTournament[]) : [];
      const upcoming = r2.ok ? ((await r2.json()) as PandaTournament[]) : [];

      const seen = new Set<string>();
      return [...running, ...upcoming]
        // Major events only — filter out B/C/D and unranked tiers
        .filter((t) => MAJOR_CS2_TIERS.has((t.tier ?? "").toLowerCase()))
        .filter((t) => {
          if (seen.has(t.slug)) return false;
          seen.add(t.slug);
          return true;
        })
        .map((t) => ({
          id:   t.slug,
          name: t.league?.name ?? t.name,
          meta: t.serie?.full_name ?? t.name,
        }));
    } catch {
      return [];
    }
  }

  return [];
}
