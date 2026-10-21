import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabasePublicConfig } from "./config";

export function createBrowserSupabaseClient() {
  const config = resolveSupabasePublicConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!config) return null;
  return createBrowserClient(config.url, config.key);
}
