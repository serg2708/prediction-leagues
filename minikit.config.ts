const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * MiniApp configuration object. Must follow the mini app manifest specification.
 *
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: "",
  },
  baseBuilder: {
    ownerAddress: "",
  },
  miniapp: {
    version: "1",
    name: "Prediction Leagues",
    subtitle: "Predict. Compete. Win USDC.",
    description: "Create leagues with friends, predict match outcomes in football, CS2 and NBA, stake USDC in a shared pool — winner takes all.",
    screenshotUrls: [],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "utility",
    tags: ["example"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Predict. Compete. Win USDC.",
    ogTitle: "Prediction Leagues",
    ogDescription: "Create leagues with friends, predict sports results, stake USDC — winner takes all.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
