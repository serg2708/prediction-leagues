"use server";

import { createClient } from "@supabase/supabase-js";
import { isValidAddress } from "@/lib/server-auth";
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
  // C2: Validate address format
  if (!isValidAddress(profileId)) {
    return { ok: false, error: "Invalid profile address" };
  }

  // Fetch match along with its league_id in one query
  const { data: match } = await supabase
    .from("matches")
    .select("status, league_id")
    .eq("id", matchId)
    .single();

  if (!match || match.status !== "upcoming") {
    return { ok: false, error: "match_not_upcoming" };
  }

  // C5: Verify caller is a paid member of this league
  const { data: membership } = await supabase
    .from("league_members")
    .select("paid")
    .eq("league_id", match.league_id)
    .eq("profile_id", profileId)
    .single();

  if (!membership?.paid) {
    return { ok: false, error: "not_a_member" };
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
