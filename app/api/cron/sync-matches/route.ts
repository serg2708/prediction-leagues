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
import { requireCron } from "@/lib/server-auth";
import { syncLeaguesGrouped, type SyncLeagueRef } from "@/lib/sync-leagues";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function GET(req: NextRequest) {
  const authErr = requireCron(req);
  if (authErr) return authErr;

  // Get all active leagues that haven't expired yet
  const { data: leagues, error } = await supabase
    .from("leagues")
    .select("id, sport, competition_id")
    .neq("status", "finished")
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);

  if (error || !leagues?.length) {
    return NextResponse.json({ ok: true, synced: 0 });
  }

  // One external API call per unique (sport, competition) — not per league
  const synced = await syncLeaguesGrouped(leagues as SyncLeagueRef[]);

  const results = Object.entries(synced).map(([leagueId, r]) => ({
    leagueId,
    inserted: r.inserted,
    ...(r.error ? { error: r.error } : {}),
  }));

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  console.log(`[cron/sync-matches] synced ${results.length} leagues, +${totalInserted} matches`);
  return NextResponse.json({ ok: true, results });
}
