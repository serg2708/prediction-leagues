"use server";

import { createClient } from "@supabase/supabase-js";
import { decodeEventLog } from "viem";
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

  // Verify the deposit tx itself was made BY this session wallet FOR this
  // league. Checking only hasDeposited(league, sessionAddr) is too weak: if the
  // wallet that actually paid differs from the session (e.g. account switched),
  // the deposit gets misattributed and the real payer is left out of the league.
  try {
    const publicClient = getPublicClient();
    const leagueBytes32 = leagueIdToBytes32(leagueId).toLowerCase();
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (receipt.status !== "success") {
      return { ok: false, error: "Deposit transaction failed" };
    }

    let matched = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== POOL_ADDRESS.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: PREDICTION_POOL_ABI, data: log.data, topics: log.topics });
        if (
          ev.eventName === "Deposited" &&
          (ev.args.leagueId as string).toLowerCase() === leagueBytes32 &&
          (ev.args.player as string).toLowerCase() === profileId.toLowerCase()
        ) {
          matched = true;
          break;
        }
      } catch {
        // not a Deposited log — skip
      }
    }

    if (!matched) {
      // Deposit wasn't made by the connected wallet for this league
      return { ok: false, error: "deposit_wallet_mismatch" };
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
