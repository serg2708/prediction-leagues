"use client";
import { useEffect, useState } from "react";
import { MOCK_LEAGUES, MOCK_MEMBERS } from "@/lib/mock";
import { supabase } from "@/lib/supabase";
import type { League } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export type DiscoverLeague = League & { members_count: number };

export function useDiscoverLeagues(profileId: string | undefined) {
  const [leagues, setLeagues]   = useState<DiscoverLeague[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (USE_MOCK) {
          const joined = new Set(
            MOCK_LEAGUES
              .filter((l) => (MOCK_MEMBERS[l.id] ?? []).some((m) => m.profile_id === profileId))
              .map((l) => l.id)
          );
          setLeagues(
            MOCK_LEAGUES
              .filter((l) => !joined.has(l.id))
              .map((l) => ({ ...l, members_count: (MOCK_MEMBERS[l.id] ?? []).length }))
          );
          return;
        }

        // All non-finished public leagues, with member counts for trending sort
        const { data: all } = await supabase
          .from("leagues")
          .select("*, league_members(count)")
          .neq("status", "finished")
          .eq("is_public", true)
          .order("created_at", { ascending: false });

        if (!all) { setLeagues([]); return; }

        // Leagues the user already joined
        const joinedIds = new Set<string>();
        if (profileId) {
          const { data: mine } = await supabase
            .from("league_members")
            .select("league_id")
            .eq("profile_id", profileId);
          for (const r of mine ?? []) joinedIds.add(r.league_id as string);
        }

        const rows = (all as (League & { league_members?: { count: number }[] })[])
          .filter((l) => !joinedIds.has(l.id))
          .map(({ league_members, ...l }) => ({
            ...l,
            members_count: league_members?.[0]?.count ?? 0,
          }))
          // Hide empty leagues: a pre-deposit draft (creator hasn't paid yet)
          // has no members and shouldn't be joinable until it's funded.
          .filter((l) => l.members_count > 0);

        setLeagues(rows as DiscoverLeague[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profileId]);

  return { leagues, loading };
}
