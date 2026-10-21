export interface SupabasePublicConfig {
  url: string;
  key: string;
}

/** Supports current publishable keys and older anon keys without exposing service-role secrets. */
export function resolveSupabasePublicConfig(
  urlValue: string | undefined,
  publishableKeyValue: string | undefined,
  legacyAnonKeyValue: string | undefined
): SupabasePublicConfig | null {
  const rawUrl = urlValue?.trim();
  const key = publishableKeyValue?.trim() || legacyAnonKeyValue?.trim();
  if (!rawUrl || !key) return null;

  try {
    const parsed = new URL(rawUrl);
    const isLocalHttp = parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (parsed.protocol !== "https:" && !isLocalHttp) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return { url: parsed.toString().replace(/\/+$/, ""), key };
  } catch {
    return null;
  }
}
