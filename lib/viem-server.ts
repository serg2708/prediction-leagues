import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

export function getPublicClient() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  const chain   = chainId === 8453 ? base : baseSepolia;
  const rpcUrl  = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];
  return createPublicClient({ chain, transport: http(rpcUrl) });
}
