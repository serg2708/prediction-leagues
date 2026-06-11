import { createClient } from "@supabase/supabase-js";
import { fetchCs2Matches, fetchFootballMatches, fetchNbaMatches, type MatchRow } from "@/lib/fetch-matches";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export type SyncLeagueRef = {
  id: string;
  sport: string;
  competition_id: string | null;
};

export type SyncResult = { inserted: number; error?: string };

/**
 * Sync upcoming matches for many leagues with ONE external API call per
 * unique (sport, competition) group instead of one per league. football-data.org
 * free tier allows 10 req/min, so 50 leagues on the same competition must not
 * mean 50 identical fetches.
 */
export async function syncLeaguesGrouped(
  leagues: SyncLeagueRef[]
): Promise<Record<string, SyncResult>> {
  const groups = new Map<string, SyncLeagueRef[]>();
  for (const league of leagues) {
    // NBA fetch ignores competition — collapse all NBA leagues into one group
    const key = league.sport === "nba" ? "nba" : `${league.sport}:${league.competition_id ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(league);
    groups.set(key, group);
  }

  const out: Record<string, SyncResult> = {};

  for (const [, group] of groups) {
    const { sport, competition_id } = group[0];
    let rows: MatchRow[];

    try {
      if (sport === "football") {
        rows = await fetchFootballMatches(competition_id ?? "PL");
      } else if (sport === "cs2") {
        rows = await fetchCs2Matches(competition_id ?? undefined);
      } else if (sport === "nba") {
        rows = await fetchNbaMatches();
      } else {
        for (const l of group) out[l.id] = { inserted: 0, error: `Unsupported sport: ${sport}` };
        continue;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch matches";
      for (const l of group) out[l.id] = { inserted: 0, error: msg };
      continue;
    }

    for (const l of group) {
      if (!rows.length) {
        out[l.id] = { inserted: 0 };
        continue;
      }
      const { error } = await supabase
        .from("matches")
        .upsert(
          rows.map((m) => ({ ...m, league_id: l.id })),
          { onConflict: "league_id,external_id", ignoreDuplicates: true }
        );
      out[l.id] = error ? { inserted: 0, error: error.message } : { inserted: rows.length };
    }
  }

  return out;
}
