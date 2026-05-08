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
import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { league_id } = await req.json() as { league_id?: string };
  if (!league_id) {
    return NextResponse.json({ error: "league_id is required" }, { status: 400 });
  }

  // Verify league exists
  const { data: league, error: leagueErr } = await supabase
    .from("leagues")
    .select("id, name, pool_usdc, status")
    .eq("id", league_id)
    .single();

  if (leagueErr || !league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  // Get winner from leaderboard
  const { data: top } = await supabase
    .from("league_leaderboard")
    .select("profile_id, points, display_name")
    .eq("league_id", league_id)
    .order("rank", { ascending: true })
    .limit(1)
    .single();

  if (!top) {
    return NextResponse.json({ error: "No members found" }, { status: 400 });
  }

  // Mark league finished if not already
  if (league.status !== "finished") {
    await supabase.from("leagues").update({ status: "finished" }).eq("id", league_id);
  }

  // Get all member fids for notifications
  const { data: members } = await supabase
    .from("league_members")
    .select("profile_id, profiles(fid)")
    .eq("league_id", league_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFids = (members ?? [])
    .map((m: any) => (Array.isArray(m.profiles) ? m.profiles[0]?.fid : m.profiles?.fid) as number | null)
    .filter((f): f is number => !!f);

  // Get winner fid
  const { data: winnerProfile } = await supabase
    .from("profiles")
    .select("fid")
    .eq("id", top.profile_id)
    .single();

  const winnerFid = winnerProfile?.fid as number | null;

  if (winnerFid) {
    await sendNotifications(
      [winnerFid],
      "You won! 🏆",
      `You topped "${league.name}" and won $${league.pool_usdc} USDC!`,
      `${ORIGIN}/leagues/${league_id}`
    );
  }

  const otherFids = allFids.filter((f) => f !== winnerFid);
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
      winner: top.profile_id,
      winnerName: top.display_name,
      points: top.points,
      payout: "skipped — POOL_SIGNER_PRIVATE_KEY not set",
    });
  }

  try {
    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
    const chain = chainId === 8453 ? base : baseSepolia;
    const rpcUrl = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

    const hash = await walletClient.writeContract({
      address: POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: "payout",
      args: [leagueIdToBytes32(league_id), top.profile_id as `0x${string}`],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    txHash = receipt.transactionHash;
    console.log(`[finalise-league] Payout tx: ${txHash}`);
  } catch (err) {
    console.error("[finalise-league] On-chain payout failed:", err);
    return NextResponse.json({
      ok: false,
      winner: top.profile_id,
      winnerName: top.display_name,
      error: String(err),
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    leagueId: league_id,
    winner: top.profile_id,
    winnerName: top.display_name,
    points: top.points,
    txHash,
  });
}
