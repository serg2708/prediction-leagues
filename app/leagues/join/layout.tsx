import type { Metadata } from "next";

const url = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Join League — Prediction Leagues",
  description: "Join a prediction league, make predictions, winner takes the USDC pool",
  openGraph: {
    title: "Join a Prediction League ⚡",
    description: "Predict match outcomes, stake USDC, winner takes all",
    url: `${url}/leagues/join`,
    siteName: "Prediction Leagues",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Join a Prediction League ⚡",
    description: "Predict match outcomes, stake USDC, winner takes all",
  },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
