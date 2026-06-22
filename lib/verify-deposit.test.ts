import { encodeAbiParameters, encodeEventTopics } from "viem";
import { describe, expect, it } from "vitest";
import { leagueIdToBytes32, POOL_ADDRESS, PREDICTION_POOL_ABI } from "@/lib/contracts";
import { type DepositReceipt, receiptHasDeposit } from "@/lib/verify-deposit";

const LEAGUE = "11111111-2222-3333-4444-555555555555";
const WALLET = "0xabcdef0123456789abcdef0123456789abcdef01";
const OTHER  = "0x1111111111111111111111111111111111111111";

/** Build a realistic Deposited log the way the chain would emit it. */
function depositLog(leagueId: string, player: string, address = POOL_ADDRESS) {
  const topics = encodeEventTopics({
    abi: PREDICTION_POOL_ABI,
    eventName: "Deposited",
    args: { leagueId: leagueIdToBytes32(leagueId), player: player as `0x${string}` },
  }) as [`0x${string}`, ...`0x${string}`[]];
  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }],
    [BigInt(5_000_000), BigInt(250_000)]
  );
  return { address, data, topics };
}

function receipt(logs: ReturnType<typeof depositLog>[], status: "success" | "reverted" = "success"): DepositReceipt {
  return { status, logs };
}

describe("receiptHasDeposit", () => {
  it("accepts a deposit by the wallet for the league", () => {
    expect(receiptHasDeposit(receipt([depositLog(LEAGUE, WALLET)]), LEAGUE, WALLET)).toBe(true);
  });

  it("is case-insensitive on the wallet address", () => {
    expect(receiptHasDeposit(receipt([depositLog(LEAGUE, WALLET)]), LEAGUE, WALLET.toUpperCase())).toBe(true);
  });

  it("rejects a deposit made by a DIFFERENT wallet (misattribution guard)", () => {
    expect(receiptHasDeposit(receipt([depositLog(LEAGUE, OTHER)]), LEAGUE, WALLET)).toBe(false);
  });

  it("rejects a deposit for a DIFFERENT league", () => {
    const otherLeague = "99999999-8888-7777-6666-555555555555";
    expect(receiptHasDeposit(receipt([depositLog(otherLeague, WALLET)]), LEAGUE, WALLET)).toBe(false);
  });

  it("rejects a reverted transaction even with a matching log", () => {
    expect(receiptHasDeposit(receipt([depositLog(LEAGUE, WALLET)], "reverted"), LEAGUE, WALLET)).toBe(false);
  });

  it("rejects an event emitted by a different contract address", () => {
    const foreign = "0x000000000000000000000000000000000000dead";
    expect(receiptHasDeposit(receipt([depositLog(LEAGUE, WALLET, foreign)]), LEAGUE, WALLET)).toBe(false);
  });

  it("ignores unrelated/garbage logs and still finds the deposit", () => {
    const garbage = { address: POOL_ADDRESS, data: "0x1234" as `0x${string}`, topics: ["0xdead"] as [`0x${string}`] };
    expect(receiptHasDeposit(receipt([garbage, depositLog(LEAGUE, WALLET)]), LEAGUE, WALLET)).toBe(true);
  });

  it("returns false for a receipt with no logs", () => {
    expect(receiptHasDeposit(receipt([]), LEAGUE, WALLET)).toBe(false);
  });
});
