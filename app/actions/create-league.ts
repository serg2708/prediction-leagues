"use server";

import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { syncLeagueMatches } from "@/app/actions/sync-matches";
import type { Sport } from "@/lib/types";

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
  profileId: string;
  txHash: string;
}): Promise<string> {
  const { leagueUuid, name, sport, competitionId, entryFee, isPublic, minPlayers, profileId, txHash } = params;

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

  // Sync matches in background — doesn't block redirect to league page
  after(() => syncLeagueMatches(finalId, sport, competitionId));

  return finalId;
}
