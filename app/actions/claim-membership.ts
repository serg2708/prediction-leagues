"use server";

import { createClient } from "@supabase/supabase-js";
import { leagueIdToBytes32, POOL_ADDRESS, PREDICTION_POOL_ABI } from "@/lib/contracts";
import { getSessionAddress } from "@/lib/session";
import { getPublicClient } from "@/lib/viem-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

/** Has the session wallet already deposited into this league on-chain? */
export async function checkDepositedAction(leagueId: string): Promise<boolean> {
  const profileId = await getSessionAddress();
  if (!profileId) return false;
  try {
    const deposited = await getPublicClient().readContract({
      address: POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: "hasDeposited",
      args: [leagueIdToBytes32(leagueId), profileId as `0x${string}`],
    });
    return Boolean(deposited);
  } catch {
    return false;
  }
}

/**
 * Recover membership for a wallet that already paid on-chain but isn't a DB
 * member (e.g. the join recording failed after a successful deposit, or the
 * session didn't match at join time). Verifies the on-chain deposit, records
 * membership idempotently, and reconciles pool_usdc to the on-chain truth — so
 * the user never has to (and never can) pay twice.
 */
export async function claimMembershipAction(
  leagueId: string
): Promise<{ ok: boolean; error?: string }> {
  const profileId = await getSessionAddress();
  if (!profileId) return { ok: false, error: "Not authenticated" };

  const publicClient = getPublicClient();
  const key = leagueIdToBytes32(leagueId);

  let deposited = false;
  let onChainPool = 0;
  try {
    const [dep, pool] = await Promise.all([
      publicClient.readContract({
        address: POOL_ADDRESS, abi: PREDICTION_POOL_ABI, functionName: "hasDeposited",
        args: [key, profileId as `0x${string}`],
      }),
      publicClient.readContract({
        address: POOL_ADDRESS, abi: PREDICTION_POOL_ABI, functionName: "getPool", args: [key],
      }),
    ]);
    deposited = Boolean(dep);
    onChainPool = Number(pool as bigint) / 1_000_000;
  } catch {
    return { ok: false, error: "Could not verify on-chain deposit" };
  }

  if (!deposited) return { ok: false, error: "no_deposit" };

  // Record membership idempotently
  const { error: memErr } = await supabase
    .from("league_members")
    .upsert({ league_id: leagueId, profile_id: profileId, paid: true }, { onConflict: "league_id,profile_id" });
  if (memErr) return { ok: false, error: memErr.message };

  // pool_usdc mirrors the contract balance — the single source of truth for funds
  await supabase.from("leagues").update({ pool_usdc: onChainPool }).eq("id", leagueId);

  return { ok: true };
}
