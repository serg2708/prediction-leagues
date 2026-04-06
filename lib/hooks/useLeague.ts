"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MOCK_LEAGUES, MOCK_MATCHES, MOCK_MEMBERS } from "@/lib/mock";
import type { League, Match, LeagueMember } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;

interface LeagueDetail {
  league: League | null;
  matches: Match[];
  members: LeagueMember[];
  loading: boolean;
  error: string | null;
}

export function useLeague(leagueId: string | undefined): LeagueDetail {
  const [state, setState] = useState<LeagueDetail>({
    league: null, matches: [], members: [], loading: true, error: null,
  });

  useEffect(() => {
    if (!leagueId) return;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        if (USE_MOCK) {
          const lid = leagueId as string;
          setState({
            league:  MOCK_LEAGUES.find((l) => l.id === lid) ?? null,
            matches: MOCK_MATCHES[lid] ?? [],
            members: (MOCK_MEMBERS[lid] ?? []).sort((a: LeagueMember, b: LeagueMember) => a.rank - b.rank),
            loading: false,
            error:   null,
          });
          return;
        }

        const [leagueRes, matchesRes, membersRes] = await Promise.all([
          supabase.from("leagues").select("*").eq("id", leagueId).single(),
          supabase.from("matches").select("*").eq("league_id", leagueId).order("starts_at", { ascending: true }),
          supabase.from("league_leaderboard").select("*").eq("league_id", leagueId).order("rank", { ascending: true }),
        ]);

        if (leagueRes.error) throw leagueRes.error;

        setState({
          league:  leagueRes.data as League,
          matches: (matchesRes.data ?? []) as Match[],
          members: (membersRes.data ?? []) as LeagueMember[],
          loading: false,
          error:   null,
        });
      } catch (e) {
        setState((s) => ({
          ...s, loading: false,
          error: e instanceof Error ? e.message : "Failed to load league",
        }));
      }
    }

    load();

    if (USE_MOCK) return;

    // ── Supabase Realtime ──────────────────────────────────────────────────────
    const channel = supabase
      .channel(`league-${leagueId}`)
      // Match status/score/result changes (live updates)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `league_id=eq.${leagueId}` },
        (payload) => {
          setState((s) => ({
            ...s,
            matches: s.matches.map((m) =>
              m.id === (payload.new as Match).id ? (payload.new as Match) : m
            ),
          }));
        }
      )
      // Points / standings changes
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_members", filter: `league_id=eq.${leagueId}` },
        () => {
          supabase
            .from("league_leaderboard")
            .select("*")
            .eq("league_id", leagueId)
            .order("rank", { ascending: true })
            .then(({ data }) => {
              if (data) setState((s) => ({ ...s, members: data as LeagueMember[] }));
            });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [leagueId]);

  return state;
}
