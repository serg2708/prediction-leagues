import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const ADDR = "0xabcdef0123456789abcdef0123456789abcdef01";

describe("session token", () => {
  it("round-trips a valid token to the lowercased address", () => {
    const token = createSessionToken(ADDR.toUpperCase());
    expect(verifySessionToken(token)).toBe(ADDR.toLowerCase());
  });

  it("rejects a tampered address", () => {
    const token = createSessionToken(ADDR);
    const [, expires, sig] = token.split(":");
    const forged = `0x0000000000000000000000000000000000000000:${expires}:${sig}`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = createSessionToken(ADDR);
    const [addr, expires] = token.split(":");
    const forged = `${addr}:${expires}:${"0".repeat(64)}`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  it("rejects an extended expiry (signature won't match)", () => {
    const token = createSessionToken(ADDR);
    const [addr, , sig] = token.split(":");
    const future = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    const forged = `${addr}:${future}:${sig}`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  it("rejects an already-expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    // Re-create the signed payload for a past expiry the same way the lib does
    const payload = `${ADDR.toLowerCase()}:${past}`;
    const sig = createHmac("sha256", process.env.SESSION_SECRET ?? "").update(payload).digest("hex");
    expect(verifySessionToken(`${payload}:${sig}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("garbage")).toBeNull();
    expect(verifySessionToken("a:b")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
  });
});
