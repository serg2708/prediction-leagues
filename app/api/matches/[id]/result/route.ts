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
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { PREDICTION_POOL_ABI, POOL_ADDRESS, leagueIdToBytes32 } from "@/lib/contracts";

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
  if (req.headers.get("authorization") !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: matchId } = await params;
  const { result, score_home, score_away } = await req.json();

  if (!result) {
    return NextResponse.json({ error: "result is required" }, { status: 400 });
  }

  // 1 — Update match status + result
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .update({ status: "finished", result, score_home, score_away })
    .eq("id", matchId)
    .select("id, league_id, team_home, team_away")
    .single();

  if (matchErr || !match) {
    return NextResponse.json({ error: matchErr?.message ?? "Match not found" }, { status: 404 });
  }

  // 2 — Award points via DB function
  await supabase.rpc("award_points", { p_match_id: matchId });

  // 3 — Notify all league members who predicted correctly
  const { data: correctPreds } = await supabase
    .from("predictions")
    .select("profile_id, profiles(fid)")
    .eq("match_id", matchId)
    .eq("outcome", result);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const correctFids = (correctPreds ?? [])
    .map((p: any) => (Array.isArray(p.profiles) ? p.profiles[0]?.fid : p.profiles?.fid) as number | null)
    .filter((f): f is number => !!f);

  if (correctFids.length) {
    await sendNotifications(
      correctFids,
      "Correct prediction! 🎯",
      `${match.team_home} vs ${match.team_away} — you got it right! +10 pts`,
      `${ORIGIN}/leagues/${match.league_id}`
    );
  }

  // 4 — Check if all matches in the league are finished → trigger payout
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

/** Find the winner, mark the league finished, send payout notification. */
async function finaliseLeague(leagueId: string) {
  // Get winner (highest points)
  const { data: top } = await supabase
    .from("league_leaderboard")
    .select("profile_id, points, profiles(fid)")
    .eq("league_id", leagueId)
    .order("rank", { ascending: true })
    .limit(1)
    .single();

  if (!top) return;

  // Mark league finished
  await supabase
    .from("leagues")
    .update({ status: "finished" })
    .eq("id", leagueId);

  // Get pool amount for notification
  const { data: league } = await supabase
    .from("leagues")
    .select("pool_usdc, name")
    .eq("id", leagueId)
    .single();

  // Notify ALL league members
  const { data: members } = await supabase
    .from("league_members")
    .select("profile_id, profiles(fid)")
    .eq("league_id", leagueId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFids = (members ?? [])
    .map((m: any) => (Array.isArray(m.profiles) ? m.profiles[0]?.fid : m.profiles?.fid) as number | null)
    .filter((f): f is number => !!f);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const winnerFid = (Array.isArray(top.profiles) ? (top.profiles as any[])[0]?.fid : (top.profiles as any)?.fid) as number | null;
  if (winnerFid) {
    // Personal winner notification
    await sendNotifications(
      [winnerFid],
      "You won! 🏆",
      `You topped ${league?.name ?? "the league"} and won $${league?.pool_usdc} USDC!`,
      `${ORIGIN}/leagues/${leagueId}`
    );
  }

  // Notify everyone else
  const otherFids = allFids.filter((f) => f !== winnerFid);
  if (otherFids.length) {
    await sendNotifications(
      otherFids,
      "League over 🏁",
      `${league?.name ?? "Your league"} has finished. See the final standings!`,
      `${ORIGIN}/leagues/${leagueId}`
    );
  }

  // On-chain payout via backend signer
  await onChainPayout(leagueId, top.profile_id as string);
}

async function onChainPayout(leagueUuid: string, winnerAddress: string) {
  const privateKey = process.env.POOL_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    console.warn("POOL_SIGNER_PRIVATE_KEY not set — skipping on-chain payout");
    return;
  }

  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  const chain   = chainId === 8453 ? base : baseSepolia;
  const rpcUrl  = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

  const account      = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const leagueBytes32 = leagueIdToBytes32(leagueUuid);

  try {
    const hash = await walletClient.writeContract({
      address:      POOL_ADDRESS,
      abi:          PREDICTION_POOL_ABI,
      functionName: "payout",
      args:         [leagueBytes32, winnerAddress as `0x${string}`],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Payout tx confirmed: ${receipt.transactionHash}`);
  } catch (err) {
    console.error("On-chain payout failed:", err);
  }
}
