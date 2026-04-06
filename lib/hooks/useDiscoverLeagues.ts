"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MOCK_LEAGUES, MOCK_MEMBERS } from "@/lib/mock";
import type { League } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export function useDiscoverLeagues(profileId: string | undefined) {
  const [leagues, setLeagues]   = useState<League[]>([]);
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
          setLeagues(MOCK_LEAGUES.filter((l) => !joined.has(l.id)));
          return;
        }

        // All non-finished public leagues
        const { data: all } = await supabase
          .from("leagues")
          .select("*")
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

        setLeagues((all as League[]).filter((l) => !joinedIds.has(l.id)));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profileId]);

  return { leagues, loading };
}
