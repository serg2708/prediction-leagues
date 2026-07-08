/**
 * Admin endpoint — finalise a finished league:
 * finds the winner, sends notifications, triggers on-chain payout.
 * Does NOT change any match results or points.
 *
 * POST /api/admin/finalise-league
 * Headers: Authorization: Bearer <ADMIN_SECRET>
 * Body: { league_id: string }
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { PREDICTION_POOL_ABI, POOL_ADDRESS, leagueIdToBytes32 } from "@/lib/contracts";
import { computePayoutAmounts, computePayoutShares } from "@/lib/payout-shares";
import { requireAdmin } from "@/lib/server-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const ORIGIN = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

async function sendNotifications(fids: number[], title: string, body: string, targetUrl: string) {
  if (!fids.length || !process.env.NOTIFY_SECRET) return;
  await fetch(`${ORIGIN}/api/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NOTIFY_SECRET}`,
    },
    body: JSON.stringify({ fids, title, body, targetUrl }),
  });
}

export async function POST(req: NextRequest) {
  const authErr = requireAdmin(req);
  if (authErr) return authErr;

  const { league_id } = await req.json() as { league_id?: string };
  if (!league_id) {
    return NextResponse.json({ error: "league_id is required" }, { status: 400 });
  }

  // Verify league exists
  const { data: league, error: leagueErr } = await supabase
    .from("leagues")
    .select("id, name, pool_usdc, status, min_players")
    .eq("id", league_id)
    .single();

  if (leagueErr || !league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  // #1: Enforce min_players — void under-filled leagues instead of paying out
  const { count: paidCount } = await supabase
    .from("league_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("league_id", league_id)
    .eq("paid", true);

  if ((paidCount ?? 0) < (league.min_players ?? 2)) {
    await supabase
      .from("leagues")
      .update({ status: "finished", needs_refund: true })
      .eq("id", league_id);
    return NextResponse.json({
      ok: true,
      voided: true,
      reason: "under_min_players",
      paidCount: paidCount ?? 0,
      minPlayers: league.min_players,
    });
  }

  // Full leaderboard, ordered
  const { data: ranked } = await supabase
    .from("league_leaderboard")
    .select("profile_id, points, display_name")
    .eq("league_id", league_id)
    .order("rank", { ascending: true });

  if (!ranked?.length) {
    return NextResponse.json({ error: "No members found" }, { status: 400 });
  }

  const top     = ranked[0];
  const winners = ranked.filter((w) => w.points === top.points);
  const isTie   = winners.length > 1;

  // M5: Validate all winner addresses before attempting payout
  const validWinners = winners.filter((w) => isAddress(w.profile_id as string));
  if (validWinners.length === 0) {
    return NextResponse.json({ error: "No valid winner addresses" }, { status: 400 });
  }

  // Podium (60/30/10) for 4+ payable players, winner-take-all / tie otherwise
  const payable = ranked.filter((w) => isAddress(w.profile_id as string));
  const { winners: payoutWinners, sharesBps } = computePayoutShares(
    payable.map((w) => ({ profile_id: w.profile_id as string, points: w.points as number }))
  );

  // Mark league finished if not already
  if (league.status !== "finished") {
    await supabase.from("leagues").update({ status: "finished" }).eq("id", league_id);
  }

  // Get all member fids for notifications
  const { data: members } = await supabase
    .from("league_members")
    .select("profile_id, profiles(fid)")
    .eq("league_id", league_id);

  const allFids = (members ?? [])
    .map((m) => {
      const p = (m as { profiles: { fid: number } | { fid: number }[] }).profiles;
      return (Array.isArray(p) ? p[0]?.fid : p?.fid) as number | null;
    })
    .filter((f): f is number => !!f);

  // Notify each actual payout winner with the exact USDC they receive — mirrors
  // payoutSplit so podium winners aren't told they won the whole pool.
  const amounts = computePayoutAmounts(league.pool_usdc, { winners: payoutWinners, sharesBps });
  const isSplit = payoutWinners.length > 1;

  const { data: winnerProfiles } = await supabase
    .from("profiles")
    .select("id, fid")
    .in("id", payoutWinners.length ? payoutWinners : [""]);

  const winnerFids = new Set<number>();
  for (const wp of winnerProfiles ?? []) {
    const fid = wp.fid as number | null;
    const amount = amounts[wp.id as string];
    if (!fid || !amount) continue;
    winnerFids.add(fid);
    await sendNotifications(
      [fid],
      isSplit ? "You're in the money! 🤝🏆" : "You won! 🏆",
      isSplit
        ? `You placed in "${league.name}" and won $${amount.toFixed(2)} USDC from the prize pool!`
        : `You topped "${league.name}" and won $${amount.toFixed(2)} USDC!`,
      `${ORIGIN}/leagues/${league_id}`
    );
  }

  const otherFids = allFids.filter((f) => !winnerFids.has(f));
  if (otherFids.length) {
    await sendNotifications(
      otherFids,
      "League over 🏁",
      `"${league.name}" has finished. See the final standings!`,
      `${ORIGIN}/leagues/${league_id}`
    );
  }

  // On-chain payout
  let txHash: string | null = null;
  const privateKey = process.env.POOL_SIGNER_PRIVATE_KEY;

  if (!privateKey) {
    return NextResponse.json({
      ok: true,
      isTie,
      winners: validWinners.map((w) => w.profile_id),
      winnerName: isTie ? `${validWinners.length} tied players` : top.display_name,
      points: top.points,
      payout: "skipped — POOL_SIGNER_PRIVATE_KEY not set",
    });
  }

  // MED: claim the payout slot atomically so this path can't race the
  // result-endpoint payout (UPDATE … WHERE payout_tx_hash IS NULL).
  const { data: claimed } = await supabase
    .from("leagues")
    .update({ payout_tx_hash: "pending" })
    .eq("id", league_id)
    .is("payout_tx_hash", null)
    .select("id")
    .single();

  if (!claimed) {
    return NextResponse.json({
      ok: true,
      isTie,
      winners: validWinners.map((w) => w.profile_id),
      winnerName: isTie ? `${validWinners.length} tied players` : top.display_name,
      points: top.points,
      payout: "skipped — already paid out",
    });
  }

  try {
    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
    const chain   = chainId === 8453 ? base : baseSepolia;
    const rpcUrl  = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

    const account = privateKeyToAccount(
      (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`
    );
    const leagueBytes32 = leagueIdToBytes32(league_id);

    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

    // payoutSplit covers every case: winner-take-all, tie split, podium
    const hash = await walletClient.writeContract({
      address: POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: "payoutSplit",
      args: [leagueBytes32, payoutWinners as `0x${string}`[], sharesBps],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // viem does not throw on an on-chain revert — check status explicitly, else
    // a reverted payout would lock the league as "paid" with no funds moved.
    if (receipt.status === "reverted") {
      throw new Error(`payoutSplit reverted (tx: ${hash})`);
    }
    txHash = receipt.transactionHash;
    // Persist the confirmed hash so the slot stays permanently locked
    await supabase
      .from("leagues")
      .update({ payout_tx_hash: txHash, payout_error: null, needs_refund: false })
      .eq("id", league_id);
    console.log(`[finalise-league] Payout tx: ${txHash}`);
  } catch (err) {
    // Release the claimed slot so a later run can retry; persist the error
    // so the admin panel can surface it instead of it dying in logs.
    await supabase
      .from("leagues")
      .update({ payout_tx_hash: null, payout_error: String(err).slice(0, 500) })
      .eq("id", league_id);
    console.error("[finalise-league] On-chain payout failed:", err);
    return NextResponse.json({
      ok: false,
      isTie,
      winners: validWinners.map((w) => w.profile_id),
      error: String(err),
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    leagueId: league_id,
    isTie,
    winners: validWinners.map((w) => w.profile_id),
    winnerName: isTie ? `${validWinners.length} players tied` : top.display_name,
    points: top.points,
    txHash,
  });
}
