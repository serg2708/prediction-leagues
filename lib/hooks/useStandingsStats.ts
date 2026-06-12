"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Match } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export interface MemberStats {
  /** Correct predictions on finished matches. */
  correct: number;
  /** Finished matches the member actually predicted. */
  total: number;
  /** Consecutive correct picks counting back from their most recent one. */
  streak: number;
  /** Result of the last 5 predicted matches, oldest → newest. */
  form: boolean[];
}

/**
 * Per-member prediction stats for a league's Standings tab. Derived from all
 * members' predictions on finished matches (publicly readable). A missed
 * match doesn't break a streak — only a wrong pick does.
 */
export function useStandingsStats(
  leagueId: string | undefined,
  matches: Match[]
): Record<string, MemberStats> {
  const [stats, setStats] = useState<Record<string, MemberStats>>({});

  // Finished matches in chronological order; key changes when a result lands,
  // which re-triggers the fetch (matches themselves update via Realtime).
  const finished = useMemo(
    () =>
      matches
        .filter((m) => m.status === "finished" && m.result)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [matches]
  );
  const finishedKey = finished.map((m) => `${m.id}:${m.result}`).join(",");

  useEffect(() => {
    if (!leagueId || USE_MOCK || finished.length === 0) {
      setStats({});
      return;
    }

    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("predictions")
        .select("profile_id, match_id, outcome")
        .in("match_id", finished.map((m) => m.id));

      if (cancelled || !data) return;

      // match_id -> prediction outcome per profile
      const byProfile = new Map<string, Map<string, string>>();
      for (const row of data as { profile_id: string; match_id: string; outcome: string }[]) {
        const inner = byProfile.get(row.profile_id) ?? new Map<string, string>();
        inner.set(row.match_id, row.outcome);
        byProfile.set(row.profile_id, inner);
      }

      const next: Record<string, MemberStats> = {};
      for (const [profileId, picks] of byProfile) {
        // Sequence of hit/miss over the matches this member predicted, in match order
        const seq: boolean[] = [];
        for (const match of finished) {
          const pick = picks.get(match.id);
          if (pick !== undefined) seq.push(pick === match.result);
        }

        let streak = 0;
        for (let i = seq.length - 1; i >= 0 && seq[i]; i--) streak++;

        next[profileId] = {
          correct: seq.filter(Boolean).length,
          total: seq.length,
          streak,
          form: seq.slice(-5),
        };
      }

      setStats(next);
    }

    load();
    return () => { cancelled = true; };
    // finishedKey captures id+result identity of the finished list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, finishedKey]);

  return stats;
}
