import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function safeCompare(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Derive a session token from ADMIN_SECRET (never stores the secret itself in the cookie). */
export function deriveAdminSessionToken(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET not set");
  return createHmac("sha256", secret).update("admin-session-v1").digest("hex");
}

function verifyAdminCookie(req: NextRequest): boolean {
  const cookie = req.cookies.get("admin_session")?.value;
  if (!cookie) return false;
  try {
    const expected = deriveAdminSessionToken();
    const a = Buffer.from(cookie);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  // Accept either a valid session cookie (browser admin) or Bearer token (server-to-server)
  const cookieOk = verifyAdminCookie(req);
  const bearerOk = !cookieOk && safeCompare(req.headers.get("authorization"), process.env.ADMIN_SECRET);
  if (!cookieOk && !bearerOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function requireCron(req: NextRequest): NextResponse | null {
  // Fail-closed: if CRON_SECRET is not set, block all requests
  if (!safeCompare(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function requireNotify(req: NextRequest): NextResponse | null {
  if (!safeCompare(req.headers.get("authorization"), process.env.NOTIFY_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}
