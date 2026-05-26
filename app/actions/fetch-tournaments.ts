"use server";

export type Tournament = {
  id: string;
  name: string;
  meta?: string; // country / league / season
};

const FOOTBALL_COMPETITIONS: Tournament[] = [
  { id: "PL",  name: "Premier League",   meta: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 England" },
  { id: "CL",  name: "Champions League", meta: "🇪🇺 Europe" },
  { id: "BL1", name: "Bundesliga",        meta: "🇩🇪 Germany" },
  { id: "SA",  name: "Serie A",           meta: "🇮🇹 Italy" },
  { id: "PD",  name: "La Liga",           meta: "🇪🇸 Spain" },
  { id: "FL1", name: "Ligue 1",           meta: "🇫🇷 France" },
  { id: "PPL", name: "Primeira Liga",     meta: "🇵🇹 Portugal" },
  { id: "DED", name: "Eredivisie",        meta: "🇳🇱 Netherlands" },
];

const NBA_TOURNAMENTS: Tournament[] = [
  { id: "nba-2025",         name: "NBA Regular Season", meta: "2024–25" },
  { id: "nba-playoffs-2025", name: "NBA Playoffs",      meta: "2024–25" },
];

type PandaTournament = {
  id: number;
  name: string;
  slug: string;
  league?: { name: string };
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
        fetch("https://api.pandascore.co/csgo/tournaments/running?per_page=10&sort=begin_at", {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetch("https://api.pandascore.co/csgo/tournaments/upcoming?per_page=10&sort=begin_at", {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      ]);

      const running  = r1.ok ? ((await r1.json()) as PandaTournament[]) : [];
      const upcoming = r2.ok ? ((await r2.json()) as PandaTournament[]) : [];

      return [...running, ...upcoming].map((t) => ({
        id:   t.slug,
        name: t.league?.name ?? t.name,
        meta: t.name,
      }));
    } catch {
      return [];
    }
  }

  return [];
}
