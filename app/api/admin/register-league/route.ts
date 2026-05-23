import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { registerLeagueOnChain } from "@/app/actions/register-league-onchain";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { league_id?: string };
  const { league_id } = body;

  if (!league_id) {
    return NextResponse.json({ error: "league_id is required" }, { status: 400 });
  }

  const { data: league, error } = await supabase
    .from("leagues")
    .select("id, entry_fee_usdc")
    .eq("id", league_id)
    .single();

  if (error || !league) {
    return NextResponse.json({ error: "League not found in database" }, { status: 404 });
  }

  const result = await registerLeagueOnChain(league.id as string, league.entry_fee_usdc as number);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
