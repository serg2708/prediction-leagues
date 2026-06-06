/**
 * Cron: notify league members 60 minutes before a match starts.
 * Runs every 30 minutes — finds matches starting in 30-90 min.
 *
 * GET /api/cron/notify-upcoming
 * Authorization: Bearer <CRON_SECRET>
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

  const now  = new Date();
  const from = new Date(now.getTime() + 30 * 60_000).toISOString();
  const to   = new Date(now.getTime() + 90 * 60_000).toISOString();

  const { data: matches } = await supabase
    .from("matches")
    .select("id, team_home, team_away, league_id, starts_at")
    .eq("status", "upcoming")
    .gte("starts_at", from)
    .lte("starts_at", to);

  if (!matches?.length) {
    return NextResponse.json({ notified: 0 });
  }

  let notified = 0;

  for (const match of matches) {
    const { data: members } = await supabase
      .from("league_members")
      .select("profile_id, profiles(fid)")
      .eq("league_id", match.league_id);

    const fids = (members ?? [])
      .map((m) => {
        const p = (m as { profiles: { fid: number } | { fid: number }[] }).profiles;
        return (Array.isArray(p) ? p[0]?.fid : p?.fid) as number | null;
      })
      .filter((f): f is number => !!f);

    if (!fids.length) continue;
    if (!process.env.NOTIFY_SECRET) continue;

    const minutesUntil = Math.round(
      (new Date(match.starts_at).getTime() - now.getTime()) / 60_000
    );

    await fetch(`${ORIGIN}/api/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NOTIFY_SECRET}`,
      },
      body: JSON.stringify({
        fids,
        title: "Match starting soon",
        body: `${match.team_home} vs ${match.team_away} in ~${minutesUntil} min — make your prediction!`,
        targetUrl: `${ORIGIN}/leagues/${match.league_id}`,
      }),
    });

    notified += fids.length;
  }

  return NextResponse.json({ notified, matches: matches.length });
}
