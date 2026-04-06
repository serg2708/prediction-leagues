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
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Matches that started > 105 minutes ago and are still not finished
  const cutoff = new Date(Date.now() - 105 * 60 * 1000).toISOString();

  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, sport, external_id, competition, team_home, team_away")
    .in("status", ["upcoming", "live"])
    .lt("starts_at", cutoff)
    .not("external_id", "is", null);

  if (error || !matches?.length) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const match of matches as PendingMatch[]) {
    let resolved: { result: PredictionOutcome; scoreHome?: number | null; scoreAway?: number | null } | null = null;

    if (match.sport === "football") {
      const r = await getFootballResult(match.external_id);
      if (r) resolved = r;
    } else if (match.sport === "cs2") {
      const r = await getCs2Result(match.external_id, match.team_home);
      if (r) resolved = r;
    }

    if (!resolved) {
      skipped.push(match.id);
      continue;
    }

    const ok = await recordResult(match.id, resolved.result, resolved.scoreHome, resolved.scoreAway);
    if (ok) updated.push(match.id);
  }

  console.log(`[cron/update-results] updated=${updated.length} skipped=${skipped.length}`);
  return NextResponse.json({ ok: true, updated: updated.length, skipped: skipped.length });
}
