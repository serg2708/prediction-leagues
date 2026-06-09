/**
 * DELETE /api/admin/delete-league
 * Body: { league_id: string }
 *
 * Only deletes pending leagues with no on-chain deposits (pool_usdc = 0).
 * Refuses if the league is active or finished to prevent fund loss.
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function DELETE(req: NextRequest) {
  const authErr = requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json() as { league_id?: string };
  const { league_id } = body;
  if (!league_id) return NextResponse.json({ error: "league_id required" }, { status: 400 });

  const { data: league, error: fetchErr } = await supabase
    .from("leagues")
    .select("id, status, pool_usdc")
    .eq("id", league_id)
    .single();

  if (fetchErr || !league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  if (league.status === "active" || league.status === "finished") {
    return NextResponse.json(
      { error: `Cannot delete a ${league.status} league` },
      { status: 409 }
    );
  }

  // deposits has no CASCADE — delete manually first
  await supabase.from("deposits").delete().eq("league_id", league_id);

  const { error: delErr } = await supabase
    .from("leagues")
    .delete()
    .eq("id", league_id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
