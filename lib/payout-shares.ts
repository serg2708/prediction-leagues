/**
 * Prize share computation for league payouts, in basis points (sum = 10_000).
 *
 * - Fewer than PODIUM_MIN_PLAYERS ranked players → winner-take-all, split
 *   equally among everyone tied at the top score (previous behaviour).
 * - Otherwise → podium: 60/30/10 across positions 1-3. Players tied across
 *   positions share the sum of those positions' shares equally (standard
 *   prize-pool tie resolution): e.g. two tied firsts get (60+30)/2 = 45% each,
 *   the next player takes the 10% third-place share.
 *
 * Output always sums to exactly 10_000 — required by the contract's
 * payoutSplit. Integer remainders inside a tied group go to its first members.
 */

export const PODIUM_BPS = [6000, 3000, 1000] as const;
export const PODIUM_MIN_PLAYERS = 4;

export type RankedMember = { profile_id: string; points: number };

export type PayoutShares = { winners: string[]; sharesBps: number[] };

/** Split `totalBps` across `n` members, remainder (+1s) to the first members. */
function splitEvenly(members: RankedMember[], totalBps: number): { id: string; bps: number }[] {
  const base = Math.floor(totalBps / members.length);
  const remainder = totalBps - base * members.length;
  return members.map((m, i) => ({ id: m.profile_id, bps: base + (i < remainder ? 1 : 0) }));
}

/**
 * @param ranked Members sorted by points descending (leaderboard order),
 *               pre-filtered to valid payable addresses.
 */
export function computePayoutShares(ranked: RankedMember[]): PayoutShares {
  if (ranked.length === 0) return { winners: [], sharesBps: [] };

  // Group consecutive members with equal points (tie groups)
  const groups: RankedMember[][] = [];
  for (const member of ranked) {
    const last = groups[groups.length - 1];
    if (last && last[0].points === member.points) last.push(member);
    else groups.push([member]);
  }

  // Small league → winner-take-all among the tied top group
  if (ranked.length < PODIUM_MIN_PLAYERS) {
    const split = splitEvenly(groups[0], 10_000);
    return {
      winners: split.map((s) => s.id),
      sharesBps: split.map((s) => s.bps),
    };
  }

  // Podium: each tie group occupies a run of positions and shares their sum
  const winners: string[] = [];
  const sharesBps: number[] = [];
  let position = 0;

  for (const group of groups) {
    if (position >= PODIUM_BPS.length) break;

    let groupBps = 0;
    for (let i = position; i < position + group.length && i < PODIUM_BPS.length; i++) {
      groupBps += PODIUM_BPS[i];
    }

    if (groupBps > 0) {
      for (const { id, bps } of splitEvenly(group, groupBps)) {
        winners.push(id);
        sharesBps.push(bps);
      }
    }

    position += group.length;
  }

  return { winners, sharesBps };
}

/**
 * Map a {winners, sharesBps} split to the exact USDC each winner receives from
 * `poolUsdc`, mirroring the contract's payoutSplit distribution: each share is
 * floored in 6-decimal base units and all rounding dust goes to the LAST
 * winner, so the amounts sum to exactly `poolUsdc`. Used to show truthful prize
 * figures in win notifications instead of implying everyone gets the full pool.
 */
export function computePayoutAmounts(
  poolUsdc: number,
  shares: PayoutShares
): Record<string, number> {
  const total = Math.round(poolUsdc * 1_000_000); // base units, as on-chain
  const out: Record<string, number> = {};
  let distributed = 0;
  shares.winners.forEach((id, i) => {
    const isLast = i === shares.winners.length - 1;
    const micro = isLast
      ? total - distributed
      : Math.floor((total * shares.sharesBps[i]) / 10_000);
    distributed += micro;
    out[id] = micro / 1_000_000;
  });
  return out;
}
