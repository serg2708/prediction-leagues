/**
 * Cron — poll external APIs for finished matches and auto-record results.
 * Runs every 15 minutes (configured in vercel.json).
 *
 * GET /api/cron/update-results
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchNbaScoreboard } from "@/lib/fetch-matches";
import { requireCron } from "@/lib/server-auth";
import type { PredictionOutcome } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const ORIGIN = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

type PendingMatch = {
  id: string;
  sport: string;
  external_id: string;
  competition: string;
  team_home: string;
  team_away: string;
  starts_at: string;
};

// ── football-data.org ─────────────────────────────────────────────────────────

type FdoScore = {
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  fullTime: { home: number | null; away: number | null };
};

type FdoMatch = {
  status: string;
  score: FdoScore;
};

async function getFootballResult(
  externalId: string
): Promise<{ result: PredictionOutcome; scoreHome: number | null; scoreAway: number | null } | null> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`https://api.football-data.org/v4/matches/${externalId}`, {
    headers: { "X-Auth-Token": apiKey },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as FdoMatch;
  if (json.status !== "FINISHED") return null;

  const winner = json.score.winner;
  if (!winner) return null;

  const result: PredictionOutcome =
    winner === "HOME_TEAM" ? "home" : winner === "AWAY_TEAM" ? "away" : "draw";

  return {
    result,
    scoreHome: json.score.fullTime.home,
    scoreAway: json.score.fullTime.away,
  };
}

// ── PandaScore CS2 ────────────────────────────────────────────────────────────

type PandaMatchResult = {
  status: string;
  winner?: { name: string } | null;
  opponents?: { opponent: { name: string } }[];
};

async function getCs2Result(
  externalId: string,
  teamHome: string
): Promise<{ result: PredictionOutcome } | null> {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`https://api.pandascore.co/matches/${externalId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as PandaMatchResult;
  if (json.status !== "finished" || !json.winner) return null;

  const winnerName = json.winner.name;
  const result: PredictionOutcome = winnerName === teamHome ? "team1" : "team2";
  return { result };
}

// ── ESPN / RapidAPI NBA ───────────────────────────────────────────────────────

async function getNbaResult(
  externalId: string,
  startsAt: string
): Promise<{ result: PredictionOutcome; scoreHome: number; scoreAway: number } | null> {
  const dateStr = new Date(startsAt).toISOString().split("T")[0].replace(/-/g, "");
  let events: Awaited<ReturnType<typeof fetchNbaScoreboard>>;
  try {
    events = await fetchNbaScoreboard(dateStr);
  } catch {
    return null;
  }

  const event = events.find((e) => e.id === externalId);
  if (!event) return null;

  const comp = event.competitions[0];
  if (!comp?.status?.type?.completed) return null;

  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const scoreHome = Number(home.score ?? 0);
  const scoreAway = Number(away.score ?? 0);
  if (scoreHome === 0 && scoreAway === 0) return null;

  const result: PredictionOutcome = scoreHome > scoreAway ? "team1" : "team2";
  return { result, scoreHome, scoreAway };
}

// ── Record result via internal API ────────────────────────────────────────────

async function recordResult(
  matchId: string,
  result: PredictionOutcome,
  scoreHome?: number | null,
  scoreAway?: number | null
): Promise<boolean> {
  const res = await fetch(`${ORIGIN}/api/matches/${matchId}/result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${process.env.ADMIN_SECRET}`,
    },
    body: JSON.stringify({
      result,
      ...(scoreHome != null ? { score_home: scoreHome } : {}),
      ...(scoreAway != null ? { score_away: scoreAway } : {}),
    }),
  });
  return res.ok;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authErr = requireCron(req);
  if (authErr) return authErr;

  // Matches that started > 105 minutes ago and are still not finished
  const cutoff = new Date(Date.now() - 105 * 60 * 1000).toISOString();

  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, sport, external_id, competition, team_home, team_away, starts_at")
    .in("status", ["upcoming", "live"])
    .lt("starts_at", cutoff)
    .not("external_id", "is", null);

  if (error || !matches?.length) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  // Deduplicate by external_id — one API call per unique real-world match,
  // then apply the result to every league row that shares that external_id.
  const byExternalId = new Map<string, PendingMatch[]>();
  for (const match of matches as PendingMatch[]) {
    const group = byExternalId.get(match.external_id) ?? [];
    group.push(match);
    byExternalId.set(match.external_id, group);
  }

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [, group] of byExternalId) {
    const { sport, external_id, team_home, starts_at } = group[0];
    let resolved: { result: PredictionOutcome; scoreHome?: number | null; scoreAway?: number | null } | null = null;

    if (sport === "football") {
      const r = await getFootballResult(external_id);
      if (r) resolved = r;
    } else if (sport === "cs2") {
      const r = await getCs2Result(external_id, team_home);
      if (r) resolved = r;
    } else if (sport === "nba") {
      const r = await getNbaResult(external_id, starts_at);
      if (r) resolved = r;
    }

    if (!resolved) {
      for (const m of group) skipped.push(m.id);
      continue;
    }

    // Record result for every league that has this match
    const { result, scoreHome, scoreAway } = resolved;
    const results = await Promise.all(
      group.map((m) => recordResult(m.id, result, scoreHome, scoreAway))
    );
    results.forEach((ok, i) => {
      if (ok) updated.push(group[i].id); else skipped.push(group[i].id);
    });
  }

  // #3: Retire phantom matches that never resolve. A match started >24h ago
  // and still unresolved (after ~96 poll attempts) is abandoned so it stops
  // blocking its league from finalising.
  const abandonCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: abandoned } = await supabase
    .from("matches")
    .update({ status: "abandoned" })
    .in("status", ["upcoming", "live"])
    .lt("starts_at", abandonCutoff)
    .select("id");

  console.log(`[cron/update-results] updated=${updated.length} skipped=${skipped.length} abandoned=${abandoned?.length ?? 0}`);
  return NextResponse.json({
    ok: true,
    updated: updated.length,
    skipped: skipped.length,
    abandoned: abandoned?.length ?? 0,
  });
}
