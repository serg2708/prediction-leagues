/**
 * POST /api/session   — establish a wallet session cookie
 * DELETE /api/session — clear the session
 *
 * Called client-side when a wallet connects. The cookie is HttpOnly so
 * server actions can read it without trusting any client-supplied address.
 */
import { type NextRequest, NextResponse } from "next/server";
import { isValidAddress } from "@/lib/server-auth";
import { createSessionToken } from "@/lib/session";

const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

export async function POST(req: NextRequest) {
  const { address } = (await req.json()) as { address?: string };

  if (!address || !isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const token = createSessionToken(address.toLowerCase());
  const res = NextResponse.json({ ok: true });
  res.cookies.set("wallet_session", token, {
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
  res.cookies.delete("wallet_session");
  return res;
}
