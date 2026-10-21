import { describe, expect, it } from "vitest";
import { resolveSupabasePublicConfig } from "./config";

describe("Supabase public client configuration", () => {
  it("prefers the current publishable key and normalizes the project URL", () => {
    expect(resolveSupabasePublicConfig(
      "https://project.supabase.co/",
      "sb_publishable_example",
      "legacy-anon"
    )).toEqual({ url: "https://project.supabase.co", key: "sb_publishable_example" });
  });

  it("supports the legacy anon key for existing deployments", () => {
    expect(resolveSupabasePublicConfig(
      "https://project.supabase.co",
      undefined,
      "legacy-anon"
    )).toEqual({ url: "https://project.supabase.co", key: "legacy-anon" });
  });

  it("allows local HTTP for development only, and rejects malformed or insecure remote URLs", () => {
    expect(resolveSupabasePublicConfig("http://localhost:54321", "local-key", undefined)?.url)
      .toBe("http://localhost:54321");
    expect(resolveSupabasePublicConfig("http://project.supabase.co", "key", undefined)).toBeNull();
    expect(resolveSupabasePublicConfig("not a URL", "key", undefined)).toBeNull();
    expect(resolveSupabasePublicConfig("https://user:pass@project.supabase.co", "key", undefined)).toBeNull();
  });

  it("fails closed when URL or public key is missing", () => {
    expect(resolveSupabasePublicConfig("", "key", undefined)).toBeNull();
    expect(resolveSupabasePublicConfig("https://project.supabase.co", undefined, undefined)).toBeNull();
  });
});
