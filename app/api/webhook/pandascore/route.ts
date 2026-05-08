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
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
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
  if (!secret) return true; // skip in local dev if not set

  // PandaScore sends HMAC-SHA256 in X-Signature header
  const signature = req.headers.get("x-signature") ?? req.headers.get("x-pandascore-token");
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
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

  if (match.status === "finished") {
    return NextResponse.json({ ok: true, skipped: "already finished" });
  }

  // Determine outcome: team1 = home team won, team2 = away team won
  const winnerName = pandaMatch.winner?.name;
  if (!winnerName) {
    return NextResponse.json({ ok: true, skipped: "no winner yet" });
  }

  const result: PredictionOutcome = winnerName === match.team_home ? "team1" : "team2";

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
