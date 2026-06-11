/**
 * Admin endpoint — refund all paid members of a voided league on-chain.
 * Returns each player's pool contribution (entryFee); the 5% platform fee
 * taken at deposit is not returned (it already left the contract).
 *
 * POST /api/admin/refund-league
 * Headers: Authorization: Bearer <ADMIN_SECRET>  (or admin_session cookie)
 * Body: { league_id: string }
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { leagueIdToBytes32, POOL_ADDRESS, PREDICTION_POOL_ABI } from "@/lib/contracts";
import { requireAdmin } from "@/lib/server-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function POST(req: NextRequest) {
  const authErr = requireAdmin(req);
  if (authErr) return authErr;

  const { league_id } = (await req.json()) as { league_id?: string };
  if (!league_id) {
    return NextResponse.json({ error: "league_id is required" }, { status: 400 });
  }

  const { data: league, error: leagueErr } = await supabase
    .from("leagues")
    .select("id, status, payout_tx_hash")
    .eq("id", league_id)
    .single();

  if (leagueErr || !league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  // Don't refund a league that already paid out a winner
  if (league.payout_tx_hash && league.payout_tx_hash !== "pending") {
    return NextResponse.json({ error: "League already settled on-chain" }, { status: 409 });
  }

  // Collect paid members — these are the depositors to refund
  const { data: members } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq("league_id", league_id)
    .eq("paid", true);

  const players = (members ?? [])
    .map((m) => m.profile_id as string)
    .filter((p) => isAddress(p));

  if (players.length === 0) {
    // Nothing to refund — just clear the flag
    await supabase
      .from("leagues")
      .update({ needs_refund: false, status: "finished" })
      .eq("id", league_id);
    return NextResponse.json({ ok: true, refunded: 0, note: "no paid depositors" });
  }

  const privateKey = process.env.POOL_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: "POOL_SIGNER_PRIVATE_KEY not set" }, { status: 500 });
  }

  // Claim the settlement slot atomically so refund can't race a payout
  const { data: claimed } = await supabase
    .from("leagues")
    .update({ payout_tx_hash: "pending" })
    .eq("id", league_id)
    .is("payout_tx_hash", null)
    .select("id")
    .single();

  if (!claimed) {
    return NextResponse.json({ error: "League is being settled by another process" }, { status: 409 });
  }

  try {
    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
    const chain   = chainId === 8453 ? base : baseSepolia;
    const rpcUrl  = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

    const account = privateKeyToAccount(
      (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`
    );
    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

    const hash = await walletClient.writeContract({
      address: POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: "refund",
      args: [leagueIdToBytes32(league_id), players as `0x${string}`[]],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    await supabase
      .from("leagues")
      .update({
        payout_tx_hash: receipt.transactionHash,
        needs_refund: false,
        status: "finished",
        payout_error: null,
      })
      .eq("id", league_id);

    console.log(`[refund-league] Refunded ${players.length} players for ${league_id}: ${receipt.transactionHash}`);
    return NextResponse.json({ ok: true, refunded: players.length, txHash: receipt.transactionHash });
  } catch (err) {
    // Release the slot and record the error so the admin can retry
    await supabase
      .from("leagues")
      .update({ payout_tx_hash: null, payout_error: String(err).slice(0, 500) })
      .eq("id", league_id);
    console.error("[refund-league] On-chain refund failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
