"use server";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function upsertProfileAction(params: {
  id: string;
  displayName: string;
  avatarUrl?: string;
  fid?: number;
}): Promise<void> {
  const { id, displayName, avatarUrl, fid } = params;

  await supabase
    .from("profiles")
    .upsert(
      { id, display_name: displayName, avatar_url: avatarUrl, fid },
      { onConflict: "id" }
    );
}
