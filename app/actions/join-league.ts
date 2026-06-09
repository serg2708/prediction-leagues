"use server";

import { createClient } from "@supabase/supabase-js";
import { POOL_ADDRESS, PREDICTION_POOL_ABI, leagueIdToBytes32 } from "@/lib/contracts";
import { getSessionAddress } from "@/lib/session";
import { getPublicClient } from "@/lib/viem-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function joinLeagueAction(params: {
  leagueId: string;
  txHash: string;
}): Promise<{ ok: boolean; error?: string }> {
  // CRIT-2: Derive caller identity from server-side session
  const profileId = await getSessionAddress();
  if (!profileId) return { ok: false, error: "Not authenticated" };

  const { leagueId, txHash } = params;

  // Read entry fee from DB — never trust client-supplied amount
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

  // MED-2: Single RPC = one PostgreSQL transaction (deposit + member + pool increment)
  const { error: joinErr } = await supabase.rpc("join_league", {
    p_league_id:  leagueId,
    p_profile_id: profileId,
    p_tx_hash:    txHash,
    p_amount:     entryFeeUsdc,
  });

  if (joinErr) {
    if (joinErr.code === "23505") return { ok: false, error: "already_joined" };
    return { ok: false, error: joinErr.message };
  }

  return { ok: true };
}
