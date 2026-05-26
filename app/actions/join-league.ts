"use server";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function joinLeagueAction(params: {
  leagueId: string;
  entryFeeUsdc: number;
  currentPoolUsdc: number;
  profileId: string;
  txHash: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { leagueId, entryFeeUsdc, currentPoolUsdc, profileId, txHash } = params;

  try {
    const [depositRes, memberRes, poolRes] = await Promise.all([
      supabase.from("deposits").insert({
        league_id: leagueId,
        profile_id: profileId,
        amount_usdc: entryFeeUsdc,
        tx_hash: txHash,
        confirmed: true,
      }),
      supabase.from("league_members").insert({
        league_id: leagueId,
        profile_id: profileId,
        paid: true,
      }),
      supabase
        .from("leagues")
        .update({ pool_usdc: currentPoolUsdc + entryFeeUsdc })
        .eq("id", leagueId),
    ]);

    const err = depositRes.error ?? memberRes.error ?? poolRes.error;
    if (err) return { ok: false, error: err.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
