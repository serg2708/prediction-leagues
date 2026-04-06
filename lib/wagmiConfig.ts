import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { Attribution } from "ox/erc8021";
import { http, cookieStorage, createConfig, createStorage } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

const apiKey         = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;
const builderCode    = process.env.NEXT_PUBLIC_BUILDER_CODE;
const dataSuffix     = builderCode
  ? Attribution.toDataSuffix({ codes: [builderCode] })
  : undefined;

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  dataSuffix,
  connectors: [
    farcasterMiniApp(),
    injected({ shimDisconnect: true }),
    coinbaseWallet({
      appName: "Prediction Leagues",
      preference: "smartWalletOnly",
    }),
  ],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [base.id]: apiKey
      ? http(`https://api.developer.coinbase.com/rpc/v1/base/${apiKey}`)
      : http(),
    [baseSepolia.id]: apiKey
      ? http(`https://api.developer.coinbase.com/rpc/v1/base-sepolia/${apiKey}`)
      : http(),
  },
});
