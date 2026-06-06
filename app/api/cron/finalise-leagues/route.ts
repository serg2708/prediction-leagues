/**
 * Cron — auto-finalise leagues when their tournament is complete.
 * A league is ready when:
 *   - all matches in the DB are finished (none upcoming/live)
 *   - at least one finished match exists
 *   - ends_at has passed (if set), OR competition_id is set (tournament-based)
 *
 * Runs daily at 09:00 UTC (configured in vercel.json).
 *
 * GET /api/cron/finalise-leagues
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/server-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const ORIGIN = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const authErr = requireCron(req);
  if (authErr) return authErr;

  const now = new Date().toISOString();

  // All active/pending leagues
  const { data: leagues, error } = await supabase
    .from("leagues")
    .select("id, name, ends_at, competition_id")
    .in("status", ["active", "pending"]);

  if (error || !leagues?.length) {
    return NextResponse.json({ ok: true, finalised: 0 });
  }

  const results: { leagueId: string; ok: boolean; winner?: string; skipped?: string; error?: string }[] = [];

  for (const league of leagues) {
    // Skip if ends_at is in the future (fixed-date leagues)
    if (league.ends_at && league.ends_at > now) {
      results.push({ leagueId: league.id, ok: false, skipped: "ends_at not reached" });
      continue;
    }

    // Skip if no ends_at AND no competition_id (undefined end condition)
    if (!league.ends_at && !league.competition_id) {
      results.push({ leagueId: league.id, ok: false, skipped: "no end condition" });
      continue;
    }

    // Check for any unfinished matches
    const { data: pending } = await supabase
      .from("matches")
      .select("id")
      .eq("league_id", league.id)
      .in("status", ["upcoming", "live"])
      .limit(1);

    if (pending?.length) {
      results.push({ leagueId: league.id, ok: false, skipped: "matches still pending" });
      continue;
    }

    // Confirm at least one finished match exists
    const { data: finished } = await supabase
      .from("matches")
      .select("id")
      .eq("league_id", league.id)
      .eq("status", "finished")
      .limit(1);

    if (!finished?.length) {
      results.push({ leagueId: league.id, ok: false, skipped: "no finished matches yet" });
      continue;
    }

    const res = await fetch(`${ORIGIN}/api/admin/finalise-league`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${process.env.ADMIN_SECRET}`,
      },
      body: JSON.stringify({ league_id: league.id }),
    });

    const json = await res.json() as { ok?: boolean; winnerName?: string; error?: string };
    results.push({
      leagueId: league.id,
      ok:       !!json.ok,
      winner:   json.winnerName,
      ...(json.error ? { error: json.error } : {}),
    });
  }

  const finalised = results.filter((r) => r.ok).length;
  console.log(`[cron/finalise-leagues] checked=${leagues.length} finalised=${finalised}`);
  return NextResponse.json({ ok: true, results });
}
