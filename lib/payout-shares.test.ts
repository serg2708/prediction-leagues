import { describe, expect, it } from "vitest";
import { computePayoutShares, type RankedMember } from "@/lib/payout-shares";

function m(id: string, points: number): RankedMember {
  return { profile_id: id, points };
}

function sum(arr: number[]): number {
  return arr.reduce((s, x) => s + x, 0);
}

describe("computePayoutShares — small leagues (winner-take-all)", () => {
  it("single clear winner takes 100%", () => {
    const res = computePayoutShares([m("a", 30), m("b", 20)]);
    expect(res.winners).toEqual(["a"]);
    expect(res.sharesBps).toEqual([10_000]);
  });

  it("two-way tie at the top splits 50/50", () => {
    const res = computePayoutShares([m("a", 30), m("b", 30), m("c", 10)]);
    expect(res.winners).toEqual(["a", "b"]);
    expect(res.sharesBps).toEqual([5_000, 5_000]);
  });

  it("three-way tie splits with remainder to the first member", () => {
    const res = computePayoutShares([m("a", 10), m("b", 10), m("c", 10)]);
    expect(res.winners).toEqual(["a", "b", "c"]);
    expect(res.sharesBps).toEqual([3_334, 3_333, 3_333]);
    expect(sum(res.sharesBps)).toBe(10_000);
  });

  it("empty input yields empty output", () => {
    expect(computePayoutShares([])).toEqual({ winners: [], sharesBps: [] });
  });
});

describe("computePayoutShares — podium (4+ players)", () => {
  it("distinct top-3 get 60/30/10", () => {
    const res = computePayoutShares([m("a", 40), m("b", 30), m("c", 20), m("d", 10)]);
    expect(res.winners).toEqual(["a", "b", "c"]);
    expect(res.sharesBps).toEqual([6_000, 3_000, 1_000]);
  });

  it("two tied firsts share 1st+2nd; next takes 3rd", () => {
    const res = computePayoutShares([m("a", 40), m("b", 40), m("c", 20), m("d", 10)]);
    expect(res.winners).toEqual(["a", "b", "c"]);
    expect(res.sharesBps).toEqual([4_500, 4_500, 1_000]);
  });

  it("three tied seconds share 2nd+3rd equally with dust to first of group", () => {
    const res = computePayoutShares([m("a", 50), m("b", 30), m("c", 30), m("d", 30), m("e", 10)]);
    expect(res.winners).toEqual(["a", "b", "c", "d"]);
    // group bps = 3000 + 1000 (+0 for position 4) = 4000 over 3 members
    expect(res.sharesBps).toEqual([6_000, 1_334, 1_333, 1_333]);
    expect(sum(res.sharesBps)).toBe(10_000);
  });

  it("players outside the podium get nothing", () => {
    const res = computePayoutShares([m("a", 40), m("b", 30), m("c", 20), m("d", 10), m("e", 5)]);
    expect(res.winners).toEqual(["a", "b", "c"]);
    expect(res.winners).not.toContain("d");
    expect(res.winners).not.toContain("e");
  });

  it("everyone tied: podium total splits across all members of the group", () => {
    const res = computePayoutShares([m("a", 10), m("b", 10), m("c", 10), m("d", 10)]);
    expect(res.winners).toEqual(["a", "b", "c", "d"]);
    expect(sum(res.sharesBps)).toBe(10_000);
  });

  it("shares always sum to exactly 10000", () => {
    // randomized-ish sweep over group shapes
    for (const points of [
      [9, 8, 7, 6, 5],
      [9, 9, 9, 9, 9, 9, 9],
      [9, 9, 8, 8, 7, 7],
      [5, 4, 4, 4, 4, 3, 2, 1],
    ]) {
      const res = computePayoutShares(points.map((p, i) => m(`p${i}`, p)));
      expect(sum(res.sharesBps)).toBe(10_000);
      expect(res.winners.length).toBe(res.sharesBps.length);
    }
  });
});
