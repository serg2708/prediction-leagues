"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MOCK_LEAGUES, MOCK_MEMBERS, MOCK_MATCHES } from "@/lib/mock";
import type { League, LeagueMember, Match } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export interface LeagueWithStats extends League {
  myPoints: number;
  myRank: number;
  totalMembers: number;
  nextMatch: Match | null;
}

export function useLeagues(profileId: string | undefined) {
  const [leagues, setLeagues] = useState<LeagueWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      setLeagues([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (USE_MOCK) {
          const result: LeagueWithStats[] = MOCK_LEAGUES
            .filter((l) =>
              (MOCK_MEMBERS[l.id] ?? []).some((m) => m.profile_id === profileId)
            )
            .map((l) => {
              const members  = MOCK_MEMBERS[l.id] ?? [];
              const me       = members.find((m) => m.profile_id === profileId);
              const matches  = MOCK_MATCHES[l.id] ?? [];
              const next     =
                matches.find((m) => m.status === "live") ??
                matches.find((m) => m.status === "upcoming") ??
                matches.at(-1) ??
                null;
              return {
                ...l,
                myPoints:     me?.points ?? 0,
                myRank:       me?.rank   ?? members.length,
                totalMembers: members.length,
                nextMatch:    next,
              };
            });
          setLeagues(result);
          return;
        }

        // Fetch leagues + my member row + all members count + next match
        const { data, error: err } = await supabase
          .from("league_members")
          .select(`
            points,
            leagues (
              id, name, sport, status, pool_usdc, entry_fee_usdc,
              creator_id, invite_code, created_at,
              league_members ( profile_id ),
              matches ( id, team_home, team_away, sport, starts_at, status, score_home, score_away, result )
            )
          `)
          .eq("profile_id", profileId);

        if (err) throw err;

        type LeagueRow = League & {
          league_members: Pick<LeagueMember, "profile_id">[];
          matches: Match[];
        };

        const result: LeagueWithStats[] = (data ?? []).map((row) => {
          const raw    = row.leagues;
          const league = (Array.isArray(raw) ? raw[0] : raw) as LeagueRow;
          const members = league?.league_members ?? [];
          const matches = league?.matches ?? [];

          // Sort to find rank
          const sorted = [...members].sort(
            (a, b) => (b as LeagueMember & { points: number }).points -
                       (a as LeagueMember & { points: number }).points
          );
          const myRank = sorted.findIndex((m) => m.profile_id === profileId) + 1;

          const next =
            matches.find((m) => m.status === "live") ??
            matches.find((m) => m.status === "upcoming") ??
            matches.at(-1) ??
            null;

          return {
            ...league,
            myPoints:     row.points as number,
            myRank:       myRank || members.length,
            totalMembers: members.length,
            nextMatch:    next,
          } as LeagueWithStats;
        });

        setLeagues(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load leagues");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [profileId]);

  return { leagues, loading, error };
}
