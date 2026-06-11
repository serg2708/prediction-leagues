import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { deriveAdminSessionToken } from "@/lib/server-auth";

const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

export async function POST(req: NextRequest) {
  // Throttle admin secret guesses per IP.
  const { allowed, retryAfter } = rateLimit(`admin-login:${clientIp(req)}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { secret } = (await req.json()) as { secret?: string };

  const expected = process.env.ADMIN_SECRET;
  let valid = false;
  if (expected && secret) {
    const a = Buffer.from(secret);
    const b = Buffer.from(expected);
    if (a.length === b.length) {
      try { valid = timingSafeEqual(a, b); } catch { /* length mismatch */ }
    }
  }

  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = deriveAdminSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}

export async function DELETE(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("admin_session");
  return res;
}
