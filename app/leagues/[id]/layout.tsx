import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const SPORT_EMOJI: Record<string, string> = { football: "⚽", cs2: "🎮", nba: "🏀" };

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const { data: league } = await supabase
    .from("leagues")
    .select("name, sport, pool_usdc, invite_code")
    .eq("id", id)
    .single();

  if (!league) return { title: "Prediction Leagues" };

  const emoji = SPORT_EMOJI[league.sport as string] ?? "🏆";
  const title = `${emoji} ${league.name} — Prediction Leagues`;
  const description = `${(league.sport as string).toUpperCase()} · $${league.pool_usdc} USDC pool · Code: ${league.invite_code}`;
  const url = `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/leagues/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Prediction Leagues",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    other: {
      "fc:frame": "vNext",
      "fc:frame:image": `${url}/opengraph-image`,
      "fc:frame:button:1": `Join ${league.name}`,
      "fc:frame:post_url": `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/leagues/join?code=${league.invite_code}`,
    },
  };
}

export default function LeagueLayout({ children }: { children: React.ReactNode }) {
  return children;
}
