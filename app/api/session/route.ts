/**
 * POST /api/session   — establish a wallet session cookie
 * DELETE /api/session — clear the session
 *
 * The client must prove wallet ownership by signing a canonical message
 * (SIWE-style). The server verifies the signature — supporting EOAs and
 * smart-contract wallets (ERC-1271/6492) via viem — before issuing the
 * HttpOnly cookie. Without this, anyone could mint a session for any
 * address they don't control.
 */
import { type NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isValidAddress } from "@/lib/server-auth";
import { createSessionToken, getSessionAddress } from "@/lib/session";
import { buildSignInMessage, SIGNIN_TTL_MS } from "@/lib/signin-message";
import { getPublicClient } from "@/lib/viem-server";

const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

/** GET /api/session — returns the verified address if a valid cookie exists.
 * Lets the client skip a redundant signature prompt when already signed in. */
export async function GET() {
  const address = await getSessionAddress();
  return NextResponse.json({ address });
}

export async function POST(req: NextRequest) {
  // Each call may trigger an on-chain verifyMessage (smart wallets), so cap
  // per-IP attempts. Legit flow is one signature per wallet connect.
  const { allowed, retryAfter } = rateLimit(`session:${clientIp(req)}`, 10, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { address, signature, issuedAt } = (await req.json()) as {
    address?: string;
    signature?: string;
    issuedAt?: number;
  };

  if (!address || !isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!signature || typeof signature !== "string" || !signature.startsWith("0x")) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }
  if (!issuedAt || !Number.isFinite(issuedAt)) {
    return NextResponse.json({ error: "Missing issuedAt" }, { status: 400 });
  }

  // Reject stale or future-dated signatures (bounded replay window)
  const skew = Date.now() - issuedAt;
  if (skew > SIGNIN_TTL_MS || skew < -60_000) {
    return NextResponse.json({ error: "Signature expired" }, { status: 401 });
  }

  // Verify the signature actually came from the claimed address.
  // publicClient.verifyMessage handles EOA + ERC-1271/6492 smart wallets.
  const message = buildSignInMessage(address, issuedAt);
  let valid = false;
  try {
    valid = await getPublicClient().verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
