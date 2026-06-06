/**
 * Farcaster Mini App webhook
 * Receives lifecycle events: frame_added, frame_removed, notifications_enabled,
 * notifications_disabled, and stores/removes notification tokens in Supabase.
 *
 * Set webhookUrl in minikit.config.ts to: <YOUR_URL>/api/webhook
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Use service-role key on the server so RLS doesn't block token writes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

// Notification URLs must match one of these Farcaster domains (M3: SSRF protection)
const ALLOWED_NOTIFY_HOSTS = new Set([
  "api.warpcast.com",
  "notifications.farcaster.xyz",
]);

function isAllowedNotifyUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    return protocol === "https:" && ALLOWED_NOTIFY_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

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

/** Verify the X-Farcaster-Signature HMAC-SHA512 header (H1: timing-safe, fail-closed) */
async function verifySignature(req: NextRequest, body: string): Promise<boolean> {
  const secret = process.env.FARCASTER_WEBHOOK_SECRET;
  if (!secret) return false; // H1: fail-closed — never open without a secret

  const sig = req.headers.get("x-farcaster-signature");
  if (!sig) return false;

  const expected = createHmac("sha512", secret).update(body).digest("hex");

  // H1: timing-safe comparison to prevent oracle attacks
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
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
        // M3: Validate notification URL before storing to prevent SSRF
        if (!isAllowedNotifyUrl(notificationDetails.url)) {
          return NextResponse.json({ error: "Invalid notification URL" }, { status: 400 });
        }
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
