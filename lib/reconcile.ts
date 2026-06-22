import { createClient } from "@supabase/supabase-js";
import { leagueIdToBytes32, POOL_ADDRESS, PREDICTION_POOL_ABI } from "@/lib/contracts";
import { getPublicClient } from "@/lib/viem-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

/**
 * Reconcile a league's displayed pool to the on-chain balance — the contract
 * is the source of truth for money. Keeps pool_usdc from drifting when a join
 * or deposit fails to record in the DB. Only call for non-finished leagues:
 * a finished league's pool is 0 on-chain (paid out) but we keep the historical
 * prize for display.
 *
 * Returns the on-chain pool in USDC, or null if it couldn't be read.
 */
export async function reconcileLeaguePool(leagueId: string): Promise<number | null> {
  let onChain: number;
  try {
    const pool = await getPublicClient().readContract({
      address: POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: "getPool",
      args: [leagueIdToBytes32(leagueId)],
    });
    onChain = Number(pool as bigint) / 1_000_000;
  } catch {
    return null;
  }

  await supabase.from("leagues").update({ pool_usdc: onChain }).eq("id", leagueId);
  return onChain;
}
