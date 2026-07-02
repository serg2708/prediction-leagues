"use server";

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { syncLeagueMatches } from "@/app/actions/sync-matches";
import { getSessionAddress } from "@/lib/session";
import type { Sport } from "@/lib/types";
import { receiptHasDeposit } from "@/lib/verify-deposit";
import { getPublicClient } from "@/lib/viem-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

/**
 * Persist the league row BEFORE the creator's deposit tx. Closes a gap where a
 * successful on-chain deposit whose createLeagueAction never ran (tab closed,
 * network drop) would leave the creator paid with no league row and no recovery
 * path. With the row present, claimMembershipAction can rebuild the membership
 * from the on-chain deposit. Idempotent — safe to call more than once, and never
 * overwrites an existing row.
 */
export async function createLeagueDraft(params: {
  leagueUuid: string;
  name: string;
  sport: Sport;
  competitionId: string;
  entryFee: number;
  isPublic: boolean;
  minPlayers: number;
}): Promise<{ ok: boolean; error?: string }> {
  const profileId = await getSessionAddress();
  if (!profileId) return { ok: false, error: "Not authenticated" };

  const { leagueUuid, name, sport, competitionId, entryFee, isPublic, minPlayers } = params;

  if (!Number.isFinite(entryFee) || entryFee <= 0 || entryFee > 10_000) {
    return { ok: false, error: "Invalid entry fee" };
  }
  if (!Number.isInteger(minPlayers) || minPlayers < 2 || minPlayers > 100) {
    return { ok: false, error: "Invalid minPlayers value" };
  }

  const { error } = await supabase.from("leagues").upsert(
    {
      id: leagueUuid,
      name,
      sport,
      competition_id: competitionId,
      entry_fee_usdc: entryFee,
      pool_usdc: 0,
      creator_id: profileId,
      is_public: isPublic,
      min_players: minPlayers,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

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
    const receipt = await getPublicClient().getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receiptHasDeposit(receipt, leagueUuid, profileId)) {
      throw new Error("deposit_wallet_mismatch");
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error("Could not verify on-chain deposit");
  }

  // Upsert (not insert): the row may already exist as a pre-deposit draft
  // (createLeagueDraft). Overwrite it with the confirmed pool so this stays
  // idempotent whether or not the draft ran.
  const { data } = await supabase
    .from("leagues")
    .upsert(
      {
        id: leagueUuid,
        name,
        sport,
        competition_id: competitionId,
        entry_fee_usdc: entryFee,
        pool_usdc: entryFee,
        creator_id: profileId,
        is_public: isPublic,
        min_players: minPlayers,
      },
      { onConflict: "id" }
    )
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
