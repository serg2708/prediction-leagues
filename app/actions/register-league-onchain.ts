"use server";

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

import { PREDICTION_POOL_ABI, POOL_ADDRESS, leagueIdToBytes32 } from "@/lib/contracts";

export async function registerLeagueOnChain(
  leagueUuid: string,
  entryFeeUsdc: number
): Promise<{ ok: boolean; error?: string }> {
  const privateKey = process.env.POOL_SIGNER_PRIVATE_KEY;
  if (!privateKey) return { ok: false, error: "POOL_SIGNER_PRIVATE_KEY not set" };

  try {
    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
    const chain   = chainId === 8453 ? base : baseSepolia;
    const rpcUrl  = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

    const account = privateKeyToAccount(
      (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`
    );

    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

    const hash = await walletClient.writeContract({
      address: POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: "createLeague",
      args: [
        leagueIdToBytes32(leagueUuid),
        BigInt(Math.round(entryFeeUsdc * 1_000_000)),
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
      return { ok: false, error: `createLeague reverted (tx: ${hash}) — check contract owner` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
