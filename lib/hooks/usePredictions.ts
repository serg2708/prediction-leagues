"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MOCK_PREDICTIONS } from "@/lib/mock";
import type { Prediction, PredictionOutcome } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export function usePredictions(leagueId: string | undefined, profileId: string | undefined) {
  // keyed by match_id
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!leagueId || !profileId) return;

    async function load() {
      if (USE_MOCK) {
        const result: Record<string, Prediction> = {};
        for (const [matchId, preds] of Object.entries(MOCK_PREDICTIONS)) {
          const mine = preds.find((p) => p.profile_id === profileId);
          if (mine) result[matchId] = mine;
        }
        setPredictions(result);
        return;
      }

      const { data } = await supabase
        .from("predictions")
        .select(`*, matches!inner(league_id)`)
        .eq("profile_id", profileId)
        .eq("matches.league_id", leagueId);

      const result: Record<string, Prediction> = {};
      for (const row of data ?? []) {
        result[row.match_id] = row as Prediction;
      }
      setPredictions(result);
    }

    load();
  }, [leagueId, profileId]);

  const predict = useCallback(
    async (matchId: string, outcome: PredictionOutcome) => {
      // Optimistic update
      setPredictions((prev) => ({
        ...prev,
        [matchId]: {
          id: prev[matchId]?.id ?? "",
          match_id: matchId,
          profile_id: profileId ?? "",
          outcome,
          created_at: new Date().toISOString(),
        },
      }));

      if (USE_MOCK || !profileId) return;

      setSaving(true);
      try {
        await supabase.from("predictions").upsert(
          { match_id: matchId, profile_id: profileId, outcome },
          { onConflict: "match_id,profile_id" }
        );
      } finally {
        setSaving(false);
      }
    },
    [profileId]
  );

  return { predictions, predict, saving };
}
