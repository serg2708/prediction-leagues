"use client";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { upsertProfileAction } from "@/app/actions/upsert-profile";
import { buildSignInMessage } from "@/lib/signin-message";
import type { Profile } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const MOCK_PROFILE: Profile = { id: "0xYou", display_name: "You" };

// Re-sign before the 24h server cookie expires to avoid a window where the
// localStorage flag says "logged in" but the cookie is already gone.
const SESSION_REFRESH_MS = 20 * 60 * 60 * 1000; // 20 hours

// Addresses verified in THIS page session — survives client-side route changes
// (module state persists across App Router navigations), so navigating between
// pages never re-prompts for a signature.
const verified = new Set<string>();
// One in-flight sign-in per address, so rapid remounts don't stack prompts.
const inflight = new Map<string, Promise<boolean>>();

function markFresh(address: string) {
  verified.add(address);
  try { localStorage.setItem(`wallet_session_at:${address}`, String(Date.now())); } catch {}
}

function hasFreshLocal(address: string): boolean {
  try {
    const ts = Number(localStorage.getItem(`wallet_session_at:${address}`));
    return Number.isFinite(ts) && Date.now() - ts < SESSION_REFRESH_MS;
  } catch {
    return false;
  }
}

/**
 * Ensure a verified wallet session exists for `address`, prompting for a
 * signature only when there's genuinely no valid session. Order of checks,
 * cheapest first: in-memory → localStorage → ask the server (authoritative,
 * survives a wiped localStorage) → finally sign.
 */
function ensureSession(
  address: string,
  signMessageAsync: ReturnType<typeof useSignMessage>["signMessageAsync"]
): Promise<boolean> {
  if (verified.has(address)) return Promise.resolve(true);

  const existing = inflight.get(address);
  if (existing) return existing;

  const run = (async () => {
    if (hasFreshLocal(address)) { verified.add(address); return true; }

    // Authoritative: does the server already hold a valid cookie for us?
    try {
      const r = await fetch("/api/session", { method: "GET" });
      if (r.ok) {
        const { address: cookieAddr } = (await r.json()) as { address: string | null };
        if (cookieAddr === address) { markFresh(address); return true; }
      }
    } catch { /* fall through to signing */ }

    // No valid session — prove ownership once.
    try {
      const issuedAt = Date.now();
      const signature = await signMessageAsync({
        account: address as `0x${string}`,
        message: buildSignInMessage(address, issuedAt),
      });
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, issuedAt }),
      });
      if (res.ok) { markFresh(address); return true; }
      return false;
    } catch {
      // User rejected or wallet unavailable — stay unauthenticated.
      return false;
    }
  })().finally(() => inflight.delete(address));

  inflight.set(address, run);
  return run;
}

export function useProfile() {
  const { address } = useAccount();
  const { context } = useMiniKit();
  const { signMessageAsync } = useSignMessage();
  const [profile, setProfile] = useState<Profile | null>(null);

  const profileId = address?.toLowerCase() ?? null;

  useEffect(() => {
    if (!profileId) {
      setProfile(null);
      return;
    }

    if (USE_MOCK) {
      setProfile(MOCK_PROFILE);
      return;
    }

    let cancelled = false;

    async function upsert() {
      const addr = profileId as string;
      const displayName =
        context?.user?.displayName ?? context?.user?.username ?? addr.slice(0, 8) ?? "";
      const avatarUrl = context?.user?.pfpUrl ?? undefined;
      const fid = context?.user?.fid ?? undefined;

      const ok = await ensureSession(addr, signMessageAsync);
      if (!ok || cancelled) return;

      await upsertProfileAction({ displayName, avatarUrl, fid });
      if (!cancelled) setProfile({ id: addr, display_name: displayName, avatar_url: avatarUrl });
    }

    upsert();
    return () => { cancelled = true; };
  }, [profileId, context, signMessageAsync]);

  return { profile, profileId };
}
