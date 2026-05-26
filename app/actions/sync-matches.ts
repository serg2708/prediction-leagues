"use server";

import { createClient } from "@supabase/supabase-js";

import { fetchCs2Matches, fetchFootballMatches, fetchNbaMatches } from "@/lib/fetch-matches";
import type { Sport } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function syncLeagueMatches(leagueId: string, sport: Sport, competitionId?: string): Promise<number> {
  let rows;

  try {
    if (sport === "football") {
      rows = await fetchFootballMatches(competitionId ?? "PL");
    } else if (sport === "cs2") {
      rows = await fetchCs2Matches(competitionId);
    } else {
      rows = await fetchNbaMatches();
    }
  } catch {
    return 0;
  }

  if (!rows.length) return 0;

  const { error } = await supabase
    .from("matches")
    .upsert(
      rows.map((m) => ({ ...m, league_id: leagueId })),
      { onConflict: "league_id,external_id", ignoreDuplicates: true }
    );

  if (error) return 0;
  return rows.length;
}
