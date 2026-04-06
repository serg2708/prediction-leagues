/**
 * Cron — sync upcoming matches for all non-finished leagues.
 * Runs daily at 06:00 UTC (configured in vercel.json).
 *
 * GET /api/cron/sync-matches
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const ORIGIN = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

type League = { id: string; sport: string; competition: string | null };

// Default competition per sport — for leagues that have no existing matches yet
const DEFAULT_COMPETITION: Record<string, string> = {
  football: "PL",
  cs2:      "csgo",
  nba:      "nba",
};

async function getCompetitionForLeague(leagueId: string, sport: string): Promise<string> {
  // Use the competition stored on the first existing match, otherwise use default
  const { data } = await supabase
    .from("matches")
    .select("competition")
    .eq("league_id", leagueId)
    .not("competition", "is", null)
    .limit(1)
    .single();

  return (data?.competition as string | null) ?? DEFAULT_COMPETITION[sport] ?? "PL";
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all non-finished leagues
  const { data: leagues, error } = await supabase
    .from("leagues")
    .select("id, sport")
    .neq("status", "finished");

  if (error || !leagues?.length) {
    return NextResponse.json({ ok: true, synced: 0 });
  }

  const results: { leagueId: string; inserted: number; error?: string }[] = [];

  for (const league of leagues as League[]) {
    const competition = await getCompetitionForLeague(league.id, league.sport);

    const res = await fetch(`${ORIGIN}/api/admin/sync-matches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${process.env.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        league_id:   league.id,
        sport:       league.sport,
        competition,
      }),
    });

    const json = await res.json() as { ok?: boolean; inserted?: number; error?: string };
    results.push({
      leagueId: league.id,
      inserted: json.inserted ?? 0,
      ...(json.error ? { error: json.error } : {}),
    });
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  console.log(`[cron/sync-matches] synced ${results.length} leagues, +${totalInserted} matches`);
  return NextResponse.json({ ok: true, results });
}
