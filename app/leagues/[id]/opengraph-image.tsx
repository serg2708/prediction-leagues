import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime     = "edge";
export const alt         = "Prediction League";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const SPORT_EMOJI: Record<string, string> = { football: "⚽", cs2: "🎮", nba: "🏀" };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: league } = await supabase
    .from("leagues")
    .select("name, sport, pool_usdc, entry_fee_usdc, invite_code")
    .eq("id", id)
    .single();

  const name    = league?.name        ?? "Prediction League";
  const sport   = (league?.sport as string | undefined) ?? "football";
  const pool    = league?.pool_usdc   ?? 0;
  const fee     = league?.entry_fee_usdc ?? 0;
  const code    = league?.invite_code ?? "";
  const emoji   = SPORT_EMOJI[sport]  ?? "🏆";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          fontFamily: "sans-serif",
          gap: 24,
          padding: 60,
        }}
      >
        {/* Sport emoji */}
        <div style={{ fontSize: 96, lineHeight: 1 }}>{emoji}</div>

        {/* League name */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#f0f0f5",
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          {name}
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 48,
            marginTop: 8,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: "#00c853" }}>${pool}</span>
            <span style={{ fontSize: 18, color: "#666" }}>USDC Pool</span>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: "#0052ff" }}>${fee}</span>
            <span style={{ fontSize: 18, color: "#666" }}>Entry Fee</span>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: "#f0f0f5" }}>{code}</span>
            <span style={{ fontSize: 18, color: "#666" }}>Invite Code</span>
          </div>
        </div>

        {/* Branding */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#444",
            fontSize: 22,
          }}
        >
          ⚡ Prediction Leagues
        </div>
      </div>
    ),
    { ...size }
  );
}
