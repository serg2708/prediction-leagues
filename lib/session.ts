import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_SECRET = process.env.SESSION_SECRET ?? process.env.ADMIN_SECRET ?? "";
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

/** How long a signed sign-in message stays valid (replay window). */
export const SIGNIN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Canonical sign-in message the wallet must sign to prove ownership.
 * Includes the address and an issue timestamp so the server can reject
 * stale signatures. Must match byte-for-byte on client and server.
 */
export function buildSignInMessage(address: string, issuedAt: number): string {
  return [
    "Prediction Leagues — sign in to verify wallet ownership.",
    "",
    `Address: ${address.toLowerCase()}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

/** Create a signed session token for a wallet address. */
export function createSessionToken(address: string): string {
  const lower = address.toLowerCase();
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${lower}:${expires}`;
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}:${sig}`;
}

/** Verify a session token and return the address, or null if invalid/expired. */
export function verifySessionToken(token: string): string | null {
  if (!SESSION_SECRET) return null;
  const parts = token.split(":");
  if (parts.length !== 3) return null;
  const [address, expiresStr, sig] = parts;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() / 1000 > expires) return null;

  const payload = `${address}:${expiresStr}`;
  const expected = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    return timingSafeEqual(a, b) ? address : null;
  } catch {
    return null;
  }
}

/** Read the verified wallet address from the session cookie (server-side only). */
export async function getSessionAddress(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get("wallet_session")?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
