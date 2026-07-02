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
import { computePayoutAmounts, computePayoutShares } from "@/lib/payout-shares";
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

  // 1 — Load match (needed for team names / league_id in notifications below)
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id, league_id, team_home, team_away, status")
    .eq("id", matchId)
    .single();

  if (matchErr || !match) {
    return NextResponse.json({ error: matchErr?.message ?? "Match not found" }, { status: 404 });
  }

  // 2 — Atomically claim & record the result in one write. The
  // `.neq("status","finished")` guard makes THIS the single writer of the
  // finish transition: concurrent or duplicate deliveries (e.g. a webhook
  // retry) that lose the race get 0 rows back and bail out before points are
  // awarded twice. Callers MUST NOT pre-mark the match finished — doing so
  // makes this update match 0 rows, so the result is never recorded and points
  // are never awarded.
  const { data: claimed, error: updateErr } = await supabase
    .from("matches")
    .update({ status: "finished", result, score_home, score_away })
    .eq("id", matchId)
    .neq("status", "finished")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json({ ok: true, matchId, leagueId: match.league_id, skipped: "already finished" });
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

  // Full leaderboard (no FK join through view — unreliable in PostgREST)
  const { data: ranked } = await supabase
    .from("league_leaderboard")
    .select("profile_id, points")
    .eq("league_id", leagueId)
    .order("rank", { ascending: true });

  if (!ranked?.length) return;

  // M5: Filter out any non-EVM addresses before payout, keep leaderboard order
  const payable = ranked.filter((w) => isAddress(w.profile_id as string));
  // Podium (60/30/10) for 4+ players, winner-take-all / tie-split otherwise
  const { winners: payoutWinners, sharesBps } = computePayoutShares(
    payable.map((w) => ({ profile_id: w.profile_id as string, points: w.points as number }))
  );

  // Pool + name for notifications
  const { data: league } = await supabase
    .from("leagues")
    .select("pool_usdc, name")
    .eq("id", leagueId)
    .single();
  const leagueName = league?.name ?? "the league";

  // Exact USDC each winner receives — mirrors the on-chain payoutSplit so a
  // notification never overstates the prize (podium pays 60/30/10, not 100%).
  const amounts = computePayoutAmounts(league?.pool_usdc ?? 0, { winners: payoutWinners, sharesBps });
  const isSplit = payoutWinners.length > 1;

  // FIDs for the actual payout winners (direct table read; FK joins via views can fail)
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
        ? `You placed in "${leagueName}" and won $${amount.toFixed(2)} USDC from the prize pool!`
        : `You topped "${leagueName}" and won $${amount.toFixed(2)} USDC!`,
      `${ORIGIN}/leagues/${leagueId}`
    );
  }

  // Everyone who didn't get paid: final-standings notification
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

  const otherFids = allFids.filter((f) => !winnerFids.has(f));
  if (otherFids.length) {
    await sendNotifications(
      otherFids,
      "League over 🏁",
      `"${leagueName}" has finished. See the final standings!`,
      `${ORIGIN}/leagues/${leagueId}`
    );
  }

  if (payoutWinners.length > 0) {
    await onChainPayout(leagueId, payoutWinners, sharesBps);
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

async function onChainPayout(leagueUuid: string, winnerAddresses: string[], sharesBps: number[]) {
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
    // payoutSplit covers every case: [winner],[10000] = winner-take-all,
    // equal shares = tie, 60/30/10 = podium (computed by computePayoutShares)
    const hash = await walletClient.writeContract({
      address:      POOL_ADDRESS,
      abi:          PREDICTION_POOL_ABI,
      functionName: "payoutSplit",
      args:         [leagueBytes32, winnerAddresses as `0x${string}`[], sharesBps],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // viem does not throw on an on-chain revert — check status explicitly, else
    // a reverted payout would lock the league as "paid" with no funds moved.
    if (receipt.status === "reverted") {
      throw new Error(`payoutSplit reverted (tx: ${receipt.transactionHash})`);
    }
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

