"use server";

import { createClient } from "@supabase/supabase-js";

import type { PredictionOutcome } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function savePredictionAction(
  matchId: string,
  profileId: string,
  outcome: PredictionOutcome
): Promise<{ ok: boolean; error?: string }> {
  const { data: match } = await supabase
    .from("matches")
    .select("status")
    .eq("id", matchId)
    .single();

  if (!match || match.status !== "upcoming") {
    return { ok: false, error: "match_not_upcoming" };
  }

  const { error } = await supabase
    .from("predictions")
    .upsert(
      { match_id: matchId, profile_id: profileId, outcome },
      { onConflict: "match_id,profile_id" }
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
