"use server";

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { decodeEventLog } from "viem";
import { syncLeagueMatches } from "@/app/actions/sync-matches";
import { POOL_ADDRESS, PREDICTION_POOL_ABI, leagueIdToBytes32 } from "@/lib/contracts";
import { getSessionAddress } from "@/lib/session";
import type { Sport } from "@/lib/types";
import { getPublicClient } from "@/lib/viem-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function createLeagueAction(params: {
  leagueUuid: string;
  name: string;
  sport: Sport;
  competitionId: string;
  entryFee: number;
  isPublic: boolean;
  minPlayers: number;
  txHash: string;
}): Promise<string> {
  // CRIT-2: Derive caller identity from server-side session
  const profileId = await getSessionAddress();
  if (!profileId) throw new Error("Not authenticated");

  const { leagueUuid, name, sport, competitionId, entryFee, isPublic, minPlayers, txHash } = params;

  if (!Number.isFinite(entryFee) || entryFee <= 0 || entryFee > 10_000) {
    throw new Error("Invalid entry fee");
  }
  if (!Number.isInteger(minPlayers) || minPlayers < 2 || minPlayers > 100) {
    throw new Error("Invalid minPlayers value");
  }

  // Verify the deposit tx was made BY this session wallet FOR this league.
  // A bare hasDeposited(league, session) check is too weak: if the wallet that
  // actually paid differs from the session, the league would be created with
  // the wrong creator_id and the deposit misattributed.
  try {
    const publicClient = getPublicClient();
    const leagueBytes32 = leagueIdToBytes32(leagueUuid).toLowerCase();
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success") throw new Error("Deposit transaction failed");

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
    if (!matched) throw new Error("deposit_wallet_mismatch");
  } catch (e) {
    throw e instanceof Error ? e : new Error("Could not verify on-chain deposit");
  }

  const { data } = await supabase
    .from("leagues")
    .insert({
      id: leagueUuid,
      name,
      sport,
      competition_id: competitionId,
      entry_fee_usdc: entryFee,
      pool_usdc: entryFee,
      creator_id: profileId,
      is_public: isPublic,
      min_players: minPlayers,
    })
    .select("id")
    .single();

  const finalId = data?.id ?? leagueUuid;

  await Promise.all([
    supabase.from("deposits").insert({
      league_id: finalId,
      profile_id: profileId,
      amount_usdc: entryFee,
      tx_hash: txHash,
      confirmed: true,
    }),
    supabase.from("league_members").insert({
      league_id: finalId,
      profile_id: profileId,
      paid: true,
    }),
  ]);

  after(() => syncLeagueMatches(finalId, sport, competitionId));

  return finalId;
}
