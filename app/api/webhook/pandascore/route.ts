/**
 * PandaScore webhook — receives match status updates for CS2.
 * When a match finishes, records the result immediately (no cron delay).
 *
 * Register at: https://developers.pandascore.co/reference/webhooks
 * URL: <YOUR_URL>/api/webhook/pandascore
 *
 * POST /api/webhook/pandascore
 * Headers: X-PandaScore-Token: <PANDASCORE_WEBHOOK_SECRET>
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PredictionOutcome } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const ORIGIN = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

// ── PandaScore payload types ──────────────────────────────────────────────────

type PandaOpponent = {
  opponent: { id: number; name: string };
};

type PandaMatch = {
  id: number;
  status: string;
  winner?: { id: number; name: string } | null;
  opponents?: PandaOpponent[];
};

type PandaWebhookPayload = {
  object_type: string;
  event: string;
  object: PandaMatch;
};

// ── Signature verification ────────────────────────────────────────────────────

function verifySignature(rawBody: string, req: NextRequest): boolean {
  const secret = process.env.PANDASCORE_WEBHOOK_SECRET;
  if (!secret) return false; // fail-closed: reject all if secret not configured

  // PandaScore sends HMAC-SHA256 in X-Signature header
  const signature = req.headers.get("x-signature") ?? req.headers.get("x-pandascore-token");
  if (!signature) return false;

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PandaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PandaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle finished matches
  if (payload.object_type !== "match" || payload.object.status !== "finished") {
    return NextResponse.json({ ok: true, skipped: "not a finished match" });
  }

  const pandaMatch = payload.object;
  const externalId = String(pandaMatch.id);

  // Find the match in our DB by external_id
  const { data: match } = await supabase
    .from("matches")
    .select("id, team_home, team_away, league_id, status")
    .eq("external_id", externalId)
    .eq("sport", "cs2")
    .maybeSingle();

  if (!match) {
    // Not a match we're tracking — ignore
    return NextResponse.json({ ok: true, skipped: "match not in DB" });
  }

  // Determine outcome: team1 = home team won, team2 = away team won
  const winnerName = pandaMatch.winner?.name;
  if (!winnerName) {
    return NextResponse.json({ ok: true, skipped: "no winner yet" });
  }

  const result: PredictionOutcome = winnerName === match.team_home ? "team1" : "team2";

  // MED-6: Atomically claim this match for processing — prevents duplicate webhook delivery
  // from racing. If 0 rows updated (already finished), bail out immediately.
  const { data: claimed } = await supabase
    .from("matches")
    .update({ status: "finished" })
    .eq("id", match.id)
    .neq("status", "finished")
    .select("id")
    .single();

  if (!claimed) {
    return NextResponse.json({ ok: true, skipped: "already finished" });
  }

  // Record result via the internal admin API (handles points, payout, notifications)
  const res = await fetch(`${ORIGIN}/api/matches/${match.id}/result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ADMIN_SECRET}`,
    },
    body: JSON.stringify({ result }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[webhook/pandascore] Failed to record result for match ${match.id}:`, text);
    return NextResponse.json({ error: "Failed to record result" }, { status: 500 });
  }

  console.log(`[webhook/pandascore] Recorded result for CS2 match ${match.id}: ${result}`);
  return NextResponse.json({ ok: true, matchId: match.id, result });
}
