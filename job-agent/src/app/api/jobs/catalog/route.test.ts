import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

vi.mock("../../../../lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn()
}));

const rows = [
  {
    id: "uuid-1",
    external_id: "101",
    canonical_url: "https://remotive.com/remote-jobs/software-dev/python-101",
    company_name: "Remote Co",
    title: "Python Developer",
    location_text: "Worldwide",
    is_remote: true,
    description: "Build APIs with Python.",
    skills: ["Python", "SQL"],
    experience_level: "entry",
    published_at: "2026-10-20T12:00:00.000Z",
    salary_text: "$80k",
    category: "Software Development",
    job_type: "full_time",
    job_sources: { source_key: "remotive", display_name: "Remotive" }
  },
  {
    id: "uuid-2",
    external_id: "typescript-engineer-berlin",
    canonical_url: "https://www.arbeitnow.com/view/typescript-engineer-berlin",
    company_name: "Berlin Tech",
    title: "TypeScript Engineer",
    location_text: "Berlin, Germany",
    is_remote: true,
    description: "Build services.",
    skills: ["TypeScript"],
    experience_level: null,
    published_at: null,
    salary_text: null,
    category: "Engineering",
    job_type: "Full Time",
    job_sources: [{ source_key: "arbeitnow", display_name: "Arbeitnow" }]
  },
  {
    id: "uuid-bad",
    external_id: "bad",
    canonical_url: "javascript:alert(1)",
    company_name: "Bad",
    title: "Unsafe",
    location_text: "Everywhere",
    is_remote: true,
    description: "Unsafe URL",
    skills: [],
    job_sources: { source_key: "remotive", display_name: "Remotive" }
  }
];

function createClientMock(options: { configured?: boolean; error?: { code: string } | null } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const result = { data: rows, error: options.error ?? null, count: rows.length };
  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };
  builder.select = chain("select");
  builder.eq = chain("eq");
  builder.or = chain("or");
  builder.textSearch = chain("textSearch");
  builder.order = chain("order");
  builder.range = vi.fn(async (...args: unknown[]) => {
    calls.push({ method: "range", args });
    return result;
  });
  const client = { from: vi.fn(() => builder) };
  return { client, calls };
}

function setClient(value: ReturnType<typeof createClientMock> | null) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue(value ? value.client as never : null);
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("public Supabase catalog search", () => {
  it("fails closed when the Supabase browser configuration is missing", async () => {
    setClient(null);
    const response = await GET(new Request("http://localhost/api/jobs/catalog?q=python"));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("not configured");
  });

  it("rejects unsupported source filters before querying the database", async () => {
    const mock = createClientMock();
    setClient(mock);
    const response = await GET(new Request("http://localhost/api/jobs/catalog?source=linkedin"));
    expect(response.status).toBe(400);
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it("maps only safe HTTPS provider rows and applies active, expiry, source and full-text filters", async () => {
    const mock = createClientMock();
    setClient(mock);
    const response = await GET(new Request("http://localhost/api/jobs/catalog?q=python&source=remotive&limit=10&page=2"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.jobs).toHaveLength(2);
    expect(payload.jobs[0]).toMatchObject({
      id: "remotive-101",
      title: "Python Developer",
      source: "Remotive",
      salary: "$80k",
      category: "Software Development"
    });
    expect(payload.jobs.some((job: { id: string }) => job.id === "remotive-bad")).toBe(false);
    expect(mock.client.from).toHaveBeenCalledWith("jobs");
    expect(mock.calls).toContainEqual({ method: "eq", args: ["active", true] });
    expect(mock.calls.some(call => call.method === "or" && String(call.args[0]).startsWith("expires_at.is.null,expires_at.gt."))).toBe(true);
    expect(mock.calls).toContainEqual({ method: "textSearch", args: ["search_vector", "python", { type: "plain", config: "simple" }] });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["job_sources.source_key", "remotive"] });
    expect(mock.calls).toContainEqual({ method: "range", args: [10, 19] });
  });

  it("supports an unfiltered browse and converts database configuration errors to a safe response", async () => {
    const mock = createClientMock({ error: { code: "PGRST205" } });
    setClient(mock);
    const response = await GET(new Request("http://localhost/api/jobs/catalog?limit=999&page=0"));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("Apply migration 0003");
    expect(mock.calls.some(call => call.method === "textSearch")).toBe(false);
    expect(mock.calls).toContainEqual({ method: "range", args: [0, 49] });
  });
});
