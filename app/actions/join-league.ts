"use server";

import { createClient } from "@supabase/supabase-js";
import { POOL_ADDRESS, PREDICTION_POOL_ABI, leagueIdToBytes32 } from "@/lib/contracts";
import { isValidAddress } from "@/lib/server-auth";
import { getPublicClient } from "@/lib/viem-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function joinLeagueAction(params: {
  leagueId: string;
  profileId: string;
  txHash: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { leagueId, profileId, txHash } = params;

  // C2: Validate caller address format
  if (!isValidAddress(profileId)) {
    return { ok: false, error: "Invalid profile address" };
  }

  // C4: Read entry fee from DB — never trust client-supplied amount
  const { data: leagueRow, error: leagueErr } = await supabase
    .from("leagues")
    .select("entry_fee_usdc")
    .eq("id", leagueId)
    .single();

  if (leagueErr || !leagueRow) {
    return { ok: false, error: "League not found" };
  }

  const entryFeeUsdc: number = leagueRow.entry_fee_usdc;

  // C3: Verify deposit on-chain before recording it in the DB
  try {
    const publicClient = getPublicClient();
    const leagueBytes32 = leagueIdToBytes32(leagueId);
    const deposited = await publicClient.readContract({
      address: POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: "hasDeposited",
      args: [leagueBytes32, profileId as `0x${string}`],
    });
    if (!deposited) {
      return { ok: false, error: "On-chain deposit not confirmed" };
    }
  } catch {
    return { ok: false, error: "Could not verify on-chain deposit" };
  }

  try {
    const [depositRes, memberRes] = await Promise.all([
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
    ]);

    const insertErr = depositRes.error ?? memberRes.error;
    if (insertErr) return { ok: false, error: insertErr.message };

    // C4: Atomic pool increment using DB-read fee — no client-supplied amount
    const { error: poolErr } = await supabase.rpc("increment_pool", {
      p_league_id: leagueId,
      p_amount: entryFeeUsdc,
    });
    if (poolErr) return { ok: false, error: poolErr.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
