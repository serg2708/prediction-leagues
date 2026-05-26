import { encodeFunctionData, keccak256, toHex, type Hex } from "viem";

export type Call = { to: Hex; data?: Hex; value?: bigint };

// ── Addresses ──────────────────────────────────────────────────────────────

const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  8453:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
};

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
export const USDC_ADDRESS  = USDC_BY_CHAIN[CHAIN_ID] ?? (() => { throw new Error(`No USDC address for chain ${CHAIN_ID}`); })();
export const POOL_ADDRESS  = (
  process.env.NEXT_PUBLIC_POOL_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

// ── ABIs ───────────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function" as const,
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "transfer",
    type: "function" as const,
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export const PREDICTION_POOL_ABI = [
  {
    name: "deposit",
    type: "function" as const,
    inputs: [{ name: "leagueId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "payout",
    type: "function" as const,
    inputs: [
      { name: "leagueId", type: "bytes32" },
      { name: "winner",   type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "createLeague",
    type: "function" as const,
    inputs: [
      { name: "leagueId",  type: "bytes32" },
      { name: "entryFee",  type: "uint96"  },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "payoutMultiple",
    type: "function" as const,
    inputs: [
      { name: "leagueId", type: "bytes32" },
      { name: "winners",  type: "address[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "hasDeposited",
    type: "function" as const,
    inputs: [{ name: "leagueId", type: "bytes32" }, { name: "player", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "getPool",
    type: "function" as const,
    inputs: [{ name: "leagueId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  { name: "NotOwner",      type: "error" as const, inputs: [] },
  { name: "LeagueNotFound", type: "error" as const, inputs: [] },
  { name: "AlreadyDeposited", type: "error" as const, inputs: [] },
  { name: "WrongAmount",   type: "error" as const, inputs: [] },
  { name: "AlreadyPaid",   type: "error" as const, inputs: [] },
  { name: "TransferFailed", type: "error" as const, inputs: [] },
  { name: "NotDepositor",  type: "error" as const, inputs: [] },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a Supabase UUID string to the bytes32 key used in PredictionPool.
 * Matches Solidity: keccak256(abi.encodePacked(uuid))
 */
export function leagueIdToBytes32(uuid: string): `0x${string}` {
  return keccak256(toHex(uuid));
}

/**
 * Three-step create: register league on-chain, approve USDC, deposit.
 * Used only by the creator on league creation.
 */
export function buildCreateLeagueCalls(leagueUuid: string, entryFeeUsdc: number): Call[] {
  const entryFeeRaw   = BigInt(Math.round(entryFeeUsdc * 1_000_000));
  // User pays entryFee + 5% platform fee; approve the total
  const approveAmount = BigInt(Math.round(entryFeeUsdc * 1.05 * 1_000_000));
  const leagueBytes32 = leagueIdToBytes32(leagueUuid);

  const createCall: Call = {
    to: POOL_ADDRESS,
    data: encodeFunctionData({
      abi: PREDICTION_POOL_ABI,
      functionName: "createLeague",
      args: [leagueBytes32, entryFeeRaw],
    }),
  };

  const approveCall: Call = {
    to: USDC_ADDRESS,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [POOL_ADDRESS, approveAmount],
    }),
  };

  const depositCall: Call = {
    to: POOL_ADDRESS,
    data: encodeFunctionData({
      abi: PREDICTION_POOL_ABI,
      functionName: "deposit",
      args: [leagueBytes32],
    }),
  };

  return [createCall, approveCall, depositCall];
}

/**
 * Two-step deposit: approve USDC allowance, then call pool.deposit(leagueId).
 * Pass both calls to <Transaction calls={buildDepositCalls(...)} />.
 */
export function buildDepositCalls(leagueUuid: string, entryFeeUsdc: number): Call[] {
  // User pays entryFee + 5% platform fee; approve the total
  const amount        = BigInt(Math.round(entryFeeUsdc * 1.05 * 1_000_000));
  const leagueBytes32 = leagueIdToBytes32(leagueUuid);

  const approveCall: Call = {
    to: USDC_ADDRESS,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [POOL_ADDRESS, amount],
    }),
  };

  const depositCall: Call = {
    to: POOL_ADDRESS,
    data: encodeFunctionData({
      abi: PREDICTION_POOL_ABI,
      functionName: "deposit",
      args: [leagueBytes32],
    }),
  };

  return [approveCall, depositCall];
}
