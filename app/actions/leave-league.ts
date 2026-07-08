"use server";

import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { leagueIdToBytes32, POOL_ADDRESS, PREDICTION_POOL_ABI } from "@/lib/contracts";
import { getSessionAddress } from "@/lib/session";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

/**
 * Player-initiated exit BEFORE the league starts. Refunds the entry fee via
 * the contract's refundPlayer (owner-signed; the 5% platform fee is not
 * returned) and removes membership. "Before start" is enforced here:
 * the league must be pending, with no finished matches and no match that has
 * already kicked off.
 */
export async function leaveLeagueAction(
  leagueId: string
): Promise<{ ok: boolean; error?: string }> {
  const profileId = await getSessionAddress();
  if (!profileId) return { ok: false, error: "not_authenticated" };

  const { data: league } = await supabase
    .from("leagues")
    .select("id, status, payout_tx_hash")
    .eq("id", leagueId)
    .single();

  if (!league) return { ok: false, error: "league_not_found" };
  if (league.status !== "pending" || league.payout_tx_hash) {
    return { ok: false, error: "league_started" };
  }

  // No finished matches, and nothing already kicked off
  const nowIso = new Date().toISOString();
  const [{ count: finishedCount }, { count: startedCount }] = await Promise.all([
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId)
      .in("status", ["finished", "live"]),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId)
      .lte("starts_at", nowIso),
  ]);
  if ((finishedCount ?? 0) > 0 || (startedCount ?? 0) > 0) {
    return { ok: false, error: "league_started" };
  }

  const { data: member } = await supabase
    .from("league_members")
    .select("paid")
    .eq("league_id", leagueId)
    .eq("profile_id", profileId)
    .single();
  if (!member?.paid) return { ok: false, error: "not_a_member" };

  const privateKey = process.env.POOL_SIGNER_PRIVATE_KEY;
  if (!privateKey) return { ok: false, error: "signer_not_configured" };

  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  const chain   = chainId === 8453 ? base : baseSepolia;
  const rpcUrl  = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  try {
    const account = privateKeyToAccount(
      (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`
    );
    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

    const hash = await walletClient.writeContract({
      address: POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: "refundPlayer",
      args: [leagueIdToBytes32(leagueId), profileId as `0x${string}`],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
      return { ok: false, error: `refundPlayer reverted (tx: ${hash})` };
    }
  } catch (err) {
    console.error("[leave-league] refundPlayer failed:", err);
    return { ok: false, error: "onchain_refund_failed" };
  }

  // On-chain refund confirmed — clean up membership, predictions, deposit rows,
  // and mirror the reduced pool.
  const { data: matchIds } = await supabase
    .from("matches").select("id").eq("league_id", leagueId);
  if (matchIds?.length) {
    await supabase
      .from("predictions")
      .delete()
      .eq("profile_id", profileId)
      .in("match_id", matchIds.map((m) => m.id));
  }
  await supabase.from("deposits").delete().eq("league_id", leagueId).eq("profile_id", profileId);
  await supabase.from("league_members").delete().eq("league_id", leagueId).eq("profile_id", profileId);

  try {
    const pool = await publicClient.readContract({
      address: POOL_ADDRESS, abi: PREDICTION_POOL_ABI, functionName: "getPool",
      args: [leagueIdToBytes32(leagueId)],
    });
    await supabase.from("leagues").update({ pool_usdc: Number(pool as bigint) / 1e6 }).eq("id", leagueId);
  } catch { /* cron reconcile will catch up */ }

  return { ok: true };
}
