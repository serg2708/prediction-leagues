/**
 * Canonical sign-in message shared by client (signs it) and server
 * (verifies it). Kept free of server-only imports so it can be bundled
 * into client components.
 */

/** How long a signed sign-in message stays valid (replay window). */
export const SIGNIN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * The wallet must sign exactly this message to prove ownership.
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
