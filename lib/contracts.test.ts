import { decodeFunctionData, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildDepositCalls,
  type Call,
  ERC20_ABI,
  leagueIdToBytes32,
  POOL_ADDRESS,
  PREDICTION_POOL_ABI,
  USDC_ADDRESS,
} from "@/lib/contracts";

const UUID = "11111111-2222-3333-4444-555555555555";

/** Pull the calldata out of a Call, asserting it's present. */
function dataOf(call: Call): Hex {
  if (!call.data) throw new Error("call has no data");
  return call.data;
}

describe("leagueIdToBytes32", () => {
  it("is deterministic for the same uuid", () => {
    expect(leagueIdToBytes32(UUID)).toBe(leagueIdToBytes32(UUID));
  });

  it("differs for different uuids", () => {
    expect(leagueIdToBytes32(UUID)).not.toBe(leagueIdToBytes32("00000000-0000-0000-0000-000000000000"));
  });

  it("returns a 32-byte hex value", () => {
    expect(leagueIdToBytes32(UUID)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("buildDepositCalls fee math", () => {
  it("approves entryFee + 5% and deposits to the pool", () => {
    const calls = buildDepositCalls(UUID, 20);
    expect(calls).toHaveLength(2);

    const [approve, deposit] = calls;

    // Approval goes to USDC for the pool, amount = 20 * 1.05 = 21 USDC
    expect(approve.to).toBe(USDC_ADDRESS);
    const approveArgs = decodeFunctionData({ abi: ERC20_ABI, data: dataOf(approve) });
    expect(approveArgs.functionName).toBe("approve");
    expect(approveArgs.args[0]).toBe(POOL_ADDRESS);
    expect(approveArgs.args[1]).toBe(BigInt(21_000_000));

    // Deposit call targets the pool with the league id
    expect(deposit.to).toBe(POOL_ADDRESS);
    const depositArgs = decodeFunctionData({ abi: PREDICTION_POOL_ABI, data: dataOf(deposit) });
    expect(depositArgs.functionName).toBe("deposit");
    expect(depositArgs.args?.[0]).toBe(leagueIdToBytes32(UUID));
  });

  it("rounds the 5% fee correctly for odd fees", () => {
    // 5 * 1.05 = 5.25 USDC -> 5_250_000 base units
    const calls = buildDepositCalls(UUID, 5);
    const approveArgs = decodeFunctionData({ abi: ERC20_ABI, data: dataOf(calls[0]) });
    expect(approveArgs.args[1]).toBe(BigInt(5_250_000));
  });
});
