/**
 * Farcaster Mini App webhook
 * Receives lifecycle events: frame_added, frame_removed, notifications_enabled,
 * notifications_disabled, and stores/removes notification tokens in Supabase.
 *
 * Set webhookUrl in minikit.config.ts to: <YOUR_URL>/api/webhook
 */
import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service-role key on the server so RLS doesn't block token writes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

interface NotificationDetails {
  url: string;
  token: string;
}

interface WebhookPayload {
  event:
    | "frame_added"
    | "frame_removed"
    | "notifications_enabled"
    | "notifications_disabled";
  notificationDetails?: NotificationDetails;
  fid?: number;
}

/** Verify the X-Farcaster-Signature HMAC-SHA512 header */
async function verifySignature(req: NextRequest, body: string): Promise<boolean> {
  const secret = process.env.FARCASTER_WEBHOOK_SECRET;
  if (!secret) return true; // skip in dev if not set

  const sig = req.headers.get("x-farcaster-signature");
  if (!sig) return false;

  const expected = createHmac("sha512", secret).update(body).digest("hex");
  return sig === expected;
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  if (!(await verifySignature(req, body))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, notificationDetails, fid } = payload;

  switch (event) {
    case "frame_added":
    case "notifications_enabled":
      if (notificationDetails && fid) {
        await supabase.from("notification_tokens").upsert(
          {
            fid,
            token: notificationDetails.token,
            url: notificationDetails.url,
            enabled: true,
          },
          { onConflict: "fid" }
        );
      }
      break;

    case "frame_removed":
    case "notifications_disabled":
      if (fid) {
        await supabase
          .from("notification_tokens")
          .update({ enabled: false })
          .eq("fid", fid);
      }
      break;
  }

  return NextResponse.json({ ok: true });
}
