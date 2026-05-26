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

type League = { id: string; sport: string; competition_id: string | null };

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all active leagues that haven't expired yet
  const { data: leagues, error } = await supabase
    .from("leagues")
    .select("id, sport, competition_id")
    .neq("status", "finished")
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);

  if (error || !leagues?.length) {
    return NextResponse.json({ ok: true, synced: 0 });
  }

  const results: { leagueId: string; inserted: number; error?: string }[] = [];

  for (const league of leagues as League[]) {
    const res = await fetch(`${ORIGIN}/api/admin/sync-matches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${process.env.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        league_id:   league.id,
        sport:       league.sport,
        competition: league.competition_id,
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
