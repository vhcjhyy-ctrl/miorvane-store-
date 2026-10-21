import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

vi.mock("../../../../lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn()
}));

function createClientMock(error: { code: string } | null = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };
  builder.select = chain("select");
  builder.eq = chain("eq");
  builder.limit = vi.fn(async (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return { data: [], error };
  });
  return { client: { from: vi.fn(() => builder) }, calls };
}

function setClient(mock: ReturnType<typeof createClientMock> | null) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue(mock ? mock.client as never : null);
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("Supabase catalog readiness", () => {
  it("returns not-ready without exposing internal configuration", async () => {
    setClient(null);
    const result = await GET();
    expect(result.status).toBe(503);
    const payload = await result.json();
    expect(payload).toMatchObject({
      status: "not_ready",
      checks: { supabase: "unconfigured", catalog: "not_checked" }
    });
    expect(JSON.stringify(payload)).not.toContain("service_role");
  });

  it("returns ready only when required catalog columns and enabled source relation can be queried", async () => {
    const mock = createClientMock();
    setClient(mock);
    const result = await GET();
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      status: "ready",
      checks: { supabase: "connected", catalog: "ready" }
    });
    expect(mock.client.from).toHaveBeenCalledWith("jobs");
    expect(mock.calls.some(call => call.method === "select"
      && String(call.args[0]).includes("search_vector")
      && String(call.args[0]).includes("job_sources!inner"))).toBe(true);
    expect(mock.calls).toContainEqual({ method: "eq", args: ["active", true] });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["job_sources.enabled", true] });
  });

  it("returns a safe remediation message when catalog migrations are missing", async () => {
    const mock = createClientMock({ code: "PGRST205" });
    setClient(mock);
    const result = await GET();
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({
      status: "not_ready",
      checks: { supabase: "connected", catalog: "error", schema: "migration_required" }
    });
  });
});
