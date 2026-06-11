/**
 * Admin endpoint — record a match result, award points, and
 * optionally trigger USDC payout if it was the last match in the league.
 *
 * POST /api/matches/:id/result
 * Headers: Authorization: Bearer <ADMIN_SECRET>
 * Body: { result: "home" | "draw" | "away" | "team1" | "team2",
 *         score_home?: number, score_away?: number }
 */
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { POOL_ADDRESS, PREDICTION_POOL_ABI, leagueIdToBytes32 } from "@/lib/contracts";
import { requireAdmin } from "@/lib/server-auth";

const VALID_OUTCOMES = new Set<string>(["home", "draw", "away", "team1", "team2"]);

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = requireAdmin(req);
  if (authErr) return authErr;

  const { id: matchId } = await params;
  const { result, score_home, score_away } = await req.json();

  // M4: Validate result against known enum values
  if (!result || !VALID_OUTCOMES.has(result)) {
    return NextResponse.json({ error: "Invalid result value" }, { status: 400 });
  }

  // 1 — Load match; bail out early if already finished (prevents double point awards)
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id, league_id, team_home, team_away, status")
    .eq("id", matchId)
    .single();

  if (matchErr || !match) {
    return NextResponse.json({ error: matchErr?.message ?? "Match not found" }, { status: 404 });
  }

  if (match.status === "finished") {
    return NextResponse.json({ ok: true, matchId, leagueId: match.league_id, skipped: "already finished" });
  }

  // 2 — Mark finished
  const { error: updateErr } = await supabase
    .from("matches")
    .update({ status: "finished", result, score_home, score_away })
    .eq("id", matchId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 3 — Award points (safe: match was not finished before this call)
  const { error: rpcErr } = await supabase.rpc("award_points", { p_match_id: matchId });
  if (rpcErr) console.error("[result] award_points failed:", rpcErr.message, rpcErr.code);

  // 4 — Notify all league members who predicted correctly
  const { data: correctPreds } = await supabase
    .from("predictions")
    .select("profile_id, profiles(fid)")
    .eq("match_id", matchId)
    .eq("outcome", result);

  const correctFids = (correctPreds ?? [])
    .map((p) => {
      const profiles = (p as { profiles: { fid: number } | { fid: number }[] }).profiles;
      return (Array.isArray(profiles) ? profiles[0]?.fid : profiles?.fid) as number | null;
    })
    .filter((f): f is number => !!f);

  if (correctFids.length) {
    await sendNotifications(
      correctFids,
      "Correct prediction! 🎯",
      `${match.team_home} vs ${match.team_away} — you got it right! +10 pts`,
      `${ORIGIN}/leagues/${match.league_id}`
    );
  }

  // 5 — Check if all matches in the league are finished → trigger payout
  const { data: pending } = await supabase
    .from("matches")
    .select("id")
    .eq("league_id", match.league_id)
    .in("status", ["upcoming", "live"]);

  if (pending?.length === 0) {
    await finaliseLeague(match.league_id);
  }

  return NextResponse.json({ ok: true, matchId, leagueId: match.league_id });
}

/** Find the winner, mark the league finished atomically, send payout notification. */
async function finaliseLeague(leagueId: string) {
  // H5: Atomic update — only proceeds if status is not already "finished"
  // This prevents double-payout from concurrent calls
  const { data: updated } = await supabase
    .from("leagues")
    .update({ status: "finished" })
    .eq("id", leagueId)
    .neq("status", "finished")
    .select("id, min_players")
    .single();

  if (!updated) return; // already finished, nothing to do

  // #1: Enforce min_players — if the league never reached its minimum paid
  // player count, void it and flag for refund instead of paying a "winner".
  const { count: paidCount } = await supabase
    .from("league_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .eq("paid", true);

  if ((paidCount ?? 0) < (updated.min_players ?? 2)) {
    await supabase.from("leagues").update({ needs_refund: true }).eq("id", leagueId);
    console.log(`[finaliseLeague] League ${leagueId} under min_players (${paidCount}/${updated.min_players}) — flagged for refund, no payout`);
    return;
  }

  // Get top score (no FK join through view — unreliable in PostgREST)
  const { data: top } = await supabase
    .from("league_leaderboard")
    .select("profile_id, points")
    .eq("league_id", leagueId)
    .order("rank", { ascending: true })
    .limit(1)
    .single();

  if (!top) return;

  // Find all members tied at the top score
  const { data: allTop } = await supabase
    .from("league_leaderboard")
    .select("profile_id, points")
    .eq("league_id", leagueId)
    .eq("points", top.points);

  const allWinners = allTop ?? [top];
  // M5: Filter out any non-EVM addresses before payout
  const winners = allWinners.filter((w) => isAddress(w.profile_id as string));
  const isTie   = winners.length > 1;

  // Get pool amount for notification
  const { data: league } = await supabase
    .from("leagues")
    .select("pool_usdc, name")
    .eq("id", leagueId)
    .single();

  // Get winner FID via direct profiles table (FK joins through views can fail)
  const { data: winnerProfile } = await supabase
    .from("profiles")
    .select("fid")
    .eq("id", top.profile_id)
    .single();
  const winnerFid = winnerProfile?.fid ?? null;

  // Notify ALL league members
  const { data: members } = await supabase
    .from("league_members")
    .select("profile_id, profiles(fid)")
    .eq("league_id", leagueId);

  const allFids = (members ?? [])
    .map((m) => {
      const p = (m as { profiles: { fid: number } | { fid: number }[] }).profiles;
      return (Array.isArray(p) ? p[0]?.fid : p?.fid) as number | null;
    })
    .filter((f): f is number => !!f);

  if (winnerFid) {
    const prize = isTie
      ? `$${((league?.pool_usdc ?? 0) / winners.length).toFixed(2)} (split)`
      : `$${league?.pool_usdc}`;
    await sendNotifications(
      [winnerFid],
      isTie ? "Tie! 🤝🏆" : "You won! 🏆",
      isTie
        ? `It's a tie! You share the prize — ${prize} USDC from "${league?.name ?? "the league"}"!`
        : `You topped ${league?.name ?? "the league"} and won ${prize} USDC!`,
      `${ORIGIN}/leagues/${leagueId}`
    );
  }

  const otherFids = allFids.filter((f) => f !== winnerFid);
  if (otherFids.length) {
    await sendNotifications(
      otherFids,
      "League over 🏁",
      `${league?.name ?? "Your league"} has finished. See the final standings!`,
      `${ORIGIN}/leagues/${leagueId}`
    );
  }

  if (winners.length > 0) {
    await onChainPayout(leagueId, winners.map((w) => w.profile_id as string));
  }
}

/** Claim the payout slot atomically before sending the tx — prevents double-payout. */
async function claimPayoutSlot(leagueId: string): Promise<boolean> {
  const placeholder = "pending";
  const { data } = await supabase
    .from("leagues")
    .update({ payout_tx_hash: placeholder })
    .eq("id", leagueId)
    .is("payout_tx_hash", null)
    .select("id")
    .single();
  return !!data;
}

async function onChainPayout(leagueUuid: string, winnerAddresses: string[]) {
  const privateKey = process.env.POOL_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    console.warn("POOL_SIGNER_PRIVATE_KEY not set — skipping on-chain payout");
    return;
  }

  // CRIT-4: Atomically claim the payout slot before sending any tx.
  // If another concurrent call already claimed it, bail out immediately.
  const claimed = await claimPayoutSlot(leagueUuid);
  if (!claimed) {
    console.log(`[payout] League ${leagueUuid} already claimed — skipping duplicate`);
    return;
  }

  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  const chain   = chainId === 8453 ? base : baseSepolia;
  const rpcUrl  = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

  const normalizedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account      = privateKeyToAccount(normalizedKey);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const leagueBytes32 = leagueIdToBytes32(leagueUuid);

  try {
    const isTie = winnerAddresses.length > 1;
    const hash = isTie
      ? await walletClient.writeContract({
          address:      POOL_ADDRESS,
          abi:          PREDICTION_POOL_ABI,
          functionName: "payoutMultiple",
          args:         [leagueBytes32, winnerAddresses as `0x${string}`[]],
        })
      : await walletClient.writeContract({
          address:      POOL_ADDRESS,
          abi:          PREDICTION_POOL_ABI,
          functionName: "payout",
          args:         [leagueBytes32, winnerAddresses[0] as `0x${string}`],
        });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // Persist the confirmed tx hash so the slot is permanently locked
    await supabase
      .from("leagues")
      .update({ payout_tx_hash: receipt.transactionHash, payout_error: null })
      .eq("id", leagueUuid);
    console.log(`Payout tx confirmed: ${receipt.transactionHash}`);
  } catch (err) {
    // Release the slot so the next cron run can retry; persist the error so
    // the admin panel surfaces the failure instead of it dying in logs.
    await supabase
      .from("leagues")
      .update({ payout_tx_hash: null, payout_error: String(err).slice(0, 500) })
      .eq("id", leagueUuid);
    console.error("On-chain payout failed:", err);
  }
}

