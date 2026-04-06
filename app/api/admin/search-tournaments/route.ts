/**
 * GET /api/admin/search-tournaments?sport=cs2&q=BLAST
 * Returns matching PandaScore tournaments with their slugs.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type PandaTournament = {
  id: number;
  slug: string;
  name: string;
  begin_at: string | null;
  end_at: string | null;
  league: { name: string };
};

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const q     = searchParams.get("q") ?? "";
  const sport = searchParams.get("sport") ?? "cs2";

  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "PANDASCORE_API_KEY not set" }, { status: 500 });

  const endpoint = sport === "cs2" ? "csgo" : sport;
  const url = `https://api.pandascore.co/${endpoint}/tournaments?search[name]=${encodeURIComponent(q)}&per_page=20&sort=begin_at`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return NextResponse.json({ error: `PandaScore error: ${res.status}` }, { status: 502 });

  const json = (await res.json()) as PandaTournament[];

  return NextResponse.json(
    json.map((t) => ({
      slug:     t.slug,
      name:     `${t.league.name} — ${t.name}`,
      begin_at: t.begin_at,
      end_at:   t.end_at,
    }))
  );
}
