/**
 * Cron: notify league members 60 minutes before a match starts.
 * Runs every 30 minutes — finds matches starting in 30-90 min.
 *
 * GET /api/cron/notify-upcoming
 * Authorization: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const ORIGIN = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now  = new Date();
  const from = new Date(now.getTime() + 30 * 60_000).toISOString();
  const to   = new Date(now.getTime() + 90 * 60_000).toISOString();

  // Matches starting in the next 30-90 minutes
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
    // Get all members of this league with their FIDs
    const { data: members } = await supabase
      .from("league_members")
      .select("profile_id, profiles(fid)")
      .eq("league_id", match.league_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fids = (members ?? [])
      .map((m: any) => (Array.isArray(m.profiles) ? m.profiles[0]?.fid : m.profiles?.fid) as number | null)
      .filter((f): f is number => !!f);

    if (!fids.length) continue;

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
        title: "Match starting soon ⚽",
        body: `${match.team_home} vs ${match.team_away} in ~${minutesUntil} min — make your prediction!`,
        targetUrl: `${ORIGIN}/leagues/${match.league_id}`,
      }),
    });

    notified += fids.length;
  }

  return NextResponse.json({ notified, matches: matches.length });
}
