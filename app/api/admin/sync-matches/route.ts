/**
 * Admin endpoint — fetch real upcoming matches and insert into a league.
 *
 * POST /api/admin/sync-matches
 * Headers: Authorization: Bearer <ADMIN_SECRET>
 * Body: { league_id: string, sport: "football" | "cs2" | "nba", competition?: string }
 *
 * football competitions: PL (Premier League), CL (Champions League),
 *   BL1 (Bundesliga), SA (Serie A), PD (La Liga), FL1 (Ligue 1)
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchCs2Matches, fetchFootballMatches, fetchNbaMatches, type MatchRow } from "@/lib/fetch-matches";
import { requireAdmin } from "@/lib/server-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authErr = requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json() as { league_id?: string; sport?: string; competition?: string; tournament?: string };
  const { league_id, sport, competition, tournament } = body;

  if (!league_id || !sport) {
    return NextResponse.json({ error: "league_id and sport are required" }, { status: 400 });
  }

  // If no competition/tournament passed, fall back to league's competition_id
  let effectiveCompetition = competition;
  let effectiveTournament  = tournament;

  if (!effectiveCompetition && !effectiveTournament) {
    const { data: leagueRow } = await supabase
      .from("leagues")
      .select("competition_id")
      .eq("id", league_id)
      .single();

    const cid = leagueRow?.competition_id as string | null;
    if (cid) {
      if (sport === "football") effectiveCompetition = cid;
      else if (sport === "cs2") effectiveTournament  = cid;
    }
  }

  let matches: MatchRow[];

  try {
    if (sport === "football") {
      matches = await fetchFootballMatches(effectiveCompetition ?? "PL");
    } else if (sport === "cs2") {
      matches = await fetchCs2Matches(effectiveTournament);
    } else if (sport === "nba") {
      matches = await fetchNbaMatches();
    } else {
      return NextResponse.json({ error: `Sport "${sport}" not supported` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch matches" },
      { status: 502 }
    );
  }

  if (!matches.length) {
    return NextResponse.json({ ok: true, inserted: 0, message: "No upcoming matches found" });
  }

  const rows = matches.map((m) => ({ ...m, league_id }));
  const { error } = await supabase
    .from("matches")
    .upsert(rows, { onConflict: "league_id,external_id", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
