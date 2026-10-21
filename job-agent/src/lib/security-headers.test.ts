import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("production response security headers", () => {
  it("sets baseline browser-hardening headers on all routes", async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find(rule => rule.source === "/(.*)");
    expect(globalRule).toBeDefined();

    const headers = new Map((globalRule?.headers ?? []).map(item => [item.key, item.value]));
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("X-DNS-Prefetch-Control")).toBe("off");
    expect(headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=()");
  });

  it("keeps Next.js standalone output and disables the powered-by header", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
