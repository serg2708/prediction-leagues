"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const MOCK_PROFILE: Profile = { id: "0xYou", display_name: "You" };

export function useProfile() {
  const { address } = useAccount();
  const { context } = useMiniKit();
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
      const displayName =
        context?.user?.displayName ?? context?.user?.username ?? profileId!.slice(0, 8);
      const avatarUrl = context?.user?.pfpUrl ?? undefined;
      const fid = context?.user?.fid ?? undefined;

      const { data } = await supabase
        .from("profiles")
        .upsert(
          { id: profileId, display_name: displayName, avatar_url: avatarUrl, fid },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (data) setProfile(data as Profile);
    }

    upsert();
  }, [profileId, context]);

  return { profile, profileId };
}
