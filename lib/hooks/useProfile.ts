"use client";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { upsertProfileAction } from "@/app/actions/upsert-profile";
import { buildSignInMessage } from "@/lib/signin-message";
import type { Profile } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const MOCK_PROFILE: Profile = { id: "0xYou", display_name: "You" };

// The single wallet_session cookie holds exactly ONE address. Cache which
// address it currently holds (not a per-address flag) — otherwise switching
// wallets back and forth leaves the cookie pointing at a different wallet than
// the connected one, misattributing every server action. Survives client-side
// route changes (module state persists across App Router navigations).
let currentSessionAddr: string | null = null;
// One in-flight sign-in per address, so rapid remounts don't stack prompts.
const inflight = new Map<string, Promise<boolean>>();

/**
 * Ensure the server session cookie matches `address`, prompting for a
 * signature only when it doesn't. The cookie (via GET /api/session) is the
 * single source of truth — we never trust a per-address local flag, because
 * the cookie is overwritten whenever a different wallet signs in.
 */
function ensureSession(
  address: string,
  signMessageAsync: ReturnType<typeof useSignMessage>["signMessageAsync"]
): Promise<boolean> {
  if (currentSessionAddr === address) return Promise.resolve(true);

  const existing = inflight.get(address);
  if (existing) return existing;

  const run = (async () => {
    // Authoritative: does the cookie already hold THIS exact address?
    try {
      const r = await fetch("/api/session", { method: "GET" });
      if (r.ok) {
        const { address: cookieAddr } = (await r.json()) as { address: string | null };
        if (cookieAddr === address) { currentSessionAddr = address; return true; }
      }
    } catch { /* fall through to signing */ }

    // Cookie missing or for a different wallet → prove ownership of THIS wallet.
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
      if (res.ok) { currentSessionAddr = address; return true; }
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
