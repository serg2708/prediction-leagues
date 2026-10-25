import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client for server code. Created on first use rather than at
// import time, so `next build` can evaluate route modules without Supabase env
// vars (e.g. Preview deployments).
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  return client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getClient();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
