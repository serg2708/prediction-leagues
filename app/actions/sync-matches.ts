"use server";

import type { Sport } from "@/lib/types";
import { syncLeaguesGrouped } from "@/lib/sync-leagues";

export async function syncLeagueMatches(leagueId: string, sport: Sport, competitionId?: string): Promise<number> {
  const results = await syncLeaguesGrouped([
    { id: leagueId, sport, competition_id: competitionId ?? null },
  ]);
  return results[leagueId]?.inserted ?? 0;
}
