import { decodeEventLog } from "viem";
import { leagueIdToBytes32, POOL_ADDRESS, PREDICTION_POOL_ABI } from "@/lib/contracts";

type ReceiptLog = {
  address: string;
  data: `0x${string}`;
  topics: [signature: `0x${string}`, ...args: `0x${string}`[]] | string[];
};

export type DepositReceipt = {
  status: "success" | "reverted";
  logs: readonly ReceiptLog[];
};

/**
 * True iff `receipt` contains a Deposited event from the pool contract for
 * `leagueId` made by `wallet`. This is the single source of truth for binding
 * a deposit to the wallet that actually paid — used by create-league and
 * join-league so a deposit can never be misattributed to a mismatched session.
 */
export function receiptHasDeposit(
  receipt: DepositReceipt,
  leagueId: string,
  wallet: string
): boolean {
  if (receipt.status !== "success") return false;

  const key = leagueIdToBytes32(leagueId).toLowerCase();
  const want = wallet.toLowerCase();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== POOL_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({
        abi: PREDICTION_POOL_ABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (
        ev.eventName === "Deposited" &&
        (ev.args.leagueId as string).toLowerCase() === key &&
        (ev.args.player as string).toLowerCase() === want
      ) {
        return true;
      }
    } catch {
      // not a Deposited log from this ABI — skip
    }
  }
  return false;
}
