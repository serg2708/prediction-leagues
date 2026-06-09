"use server";

import { createClient } from "@supabase/supabase-js";
import { getSessionAddress } from "@/lib/session";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const ALLOWED_AVATAR_HOSTS = new Set([
  "imagedelivery.net",
  "i.imgur.com",
  "res.cloudinary.com",
  "ipfs.io",
  "gateway.pinata.cloud",
  "wrpcd.net",
  "storage.googleapis.com",
]);

export async function upsertProfileAction(params: {
  displayName: string;
  avatarUrl?: string;
  fid?: number;
}): Promise<void> {
  // CRIT-2/HIGH-2: Use session to identify the caller — never trust a client-supplied id
  const id = await getSessionAddress();
  if (!id) return;

  const { displayName, avatarUrl, fid } = params;

  const safeName = displayName.slice(0, 64);

  let safeAvatar: string | undefined;
  if (avatarUrl) {
    try {
      const u = new URL(avatarUrl);
      if (u.protocol === "https:" && ALLOWED_AVATAR_HOSTS.has(u.hostname)) {
        safeAvatar = avatarUrl;
      }
    } catch {
      // invalid URL — discard
    }
  }

  await supabase
    .from("profiles")
    .upsert(
      { id, display_name: safeName, avatar_url: safeAvatar, fid },
      { onConflict: "id" }
    );
}
