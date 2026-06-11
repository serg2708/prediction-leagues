import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture every upsert so we can assert which leagues got rows
const upsertedLeagueIds: string[] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      upsert: (rows: { league_id: string }[]) => {
        for (const r of rows) upsertedLeagueIds.push(r.league_id);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const footballSpy = vi.fn(async (_c?: string) => [
  { team_home: "A", team_away: "B", sport: "football", starts_at: "2026-07-01T00:00:00Z", status: "upcoming", external_id: "1", competition: "PL" },
]);
const cs2Spy = vi.fn(async (_t?: string) => [
  { team_home: "X", team_away: "Y", sport: "cs2", starts_at: "2026-07-01T00:00:00Z", status: "upcoming", external_id: "2", competition: "csgo" },
]);
const nbaSpy = vi.fn(async () => [
  { team_home: "H", team_away: "Z", sport: "nba", starts_at: "2026-07-01T00:00:00Z", status: "upcoming", external_id: "3", competition: "nba" },
]);

vi.mock("@/lib/fetch-matches", () => ({
  fetchFootballMatches: (c?: string) => footballSpy(c),
  fetchCs2Matches: (t?: string) => cs2Spy(t),
  fetchNbaMatches: () => nbaSpy(),
}));

import { syncLeaguesGrouped } from "@/lib/sync-leagues";

beforeEach(() => {
  upsertedLeagueIds.length = 0;
  footballSpy.mockClear();
  cs2Spy.mockClear();
  nbaSpy.mockClear();
});

describe("syncLeaguesGrouped", () => {
  it("fetches once per (sport, competition) but upserts every league in the group", async () => {
    const res = await syncLeaguesGrouped([
      { id: "L1", sport: "football", competition_id: "PL" },
      { id: "L2", sport: "football", competition_id: "PL" },
      { id: "L3", sport: "football", competition_id: "CL" },
    ]);

    // One API call for PL (shared by L1+L2), one for CL
    expect(footballSpy).toHaveBeenCalledTimes(2);
    // But all three leagues received rows
    expect(upsertedLeagueIds.sort()).toEqual(["L1", "L2", "L3"]);
    expect(res.L1.inserted).toBe(1);
    expect(res.L2.inserted).toBe(1);
  });

  it("collapses all NBA leagues into a single fetch regardless of competition", async () => {
    await syncLeaguesGrouped([
      { id: "N1", sport: "nba", competition_id: "nba-2025" },
      { id: "N2", sport: "nba", competition_id: "nba-playoffs" },
    ]);
    expect(nbaSpy).toHaveBeenCalledTimes(1);
    expect(upsertedLeagueIds.sort()).toEqual(["N1", "N2"]);
  });

  it("isolates a failing group without affecting others", async () => {
    footballSpy.mockRejectedValueOnce(new Error("API 429"));
    const res = await syncLeaguesGrouped([
      { id: "F1", sport: "football", competition_id: "PL" },
      { id: "C1", sport: "cs2", competition_id: "blast" },
    ]);
    expect(res.F1.inserted).toBe(0);
    expect(res.F1.error).toContain("429");
    expect(res.C1.inserted).toBe(1); // cs2 group still succeeded
  });

  it("passes the cs2 competition through as the tournament slug", async () => {
    await syncLeaguesGrouped([{ id: "C2", sport: "cs2", competition_id: "iem-katowice" }]);
    expect(cs2Spy).toHaveBeenCalledWith("iem-katowice");
  });
});
