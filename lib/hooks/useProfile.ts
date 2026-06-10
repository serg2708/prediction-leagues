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

/** Whether we've established a verified session for this address recently. */
function hasFreshSession(address: string): boolean {
  try {
    const ts = Number(localStorage.getItem(`wallet_session_at:${address}`));
    return Number.isFinite(ts) && Date.now() - ts < SESSION_REFRESH_MS;
  } catch {
    return false;
  }
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

    async function upsert() {
      const addr = profileId as string;
      const displayName =
        context?.user?.displayName ?? context?.user?.username ?? addr.slice(0, 8) ?? "";
      const avatarUrl = context?.user?.pfpUrl ?? undefined;
      const fid = context?.user?.fid ?? undefined;

      // Establish a verified HttpOnly session cookie by proving wallet ownership.
      // Only prompt for a signature when we don't already have a fresh session.
      if (!hasFreshSession(addr)) {
        try {
          const issuedAt = Date.now();
          const signature = await signMessageAsync({
            account: addr as `0x${string}`,
            message: buildSignInMessage(addr, issuedAt),
          });
          const res = await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: addr, signature, issuedAt }),
          });
          if (res.ok) {
            try { localStorage.setItem(`wallet_session_at:${addr}`, String(Date.now())); } catch {}
          }
        } catch {
          // User rejected signature or wallet unavailable — leave unauthenticated.
          // Server actions will return not_authenticated until they sign in.
          return;
        }
      }

      await upsertProfileAction({ displayName, avatarUrl, fid });
      setProfile({ id: addr, display_name: displayName, avatar_url: avatarUrl });
    }

    upsert();
  }, [profileId, context, signMessageAsync]);

  return { profile, profileId };
}
