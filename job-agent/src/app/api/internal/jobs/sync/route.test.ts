import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createClient } from "@supabase/supabase-js";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn()
}));

const syncSecret = "sync-secret-value-that-is-long-enough-for-production-001";

function request(token?: string) {
  return new Request("http://localhost/api/internal/jobs/sync", {
    method: "POST",
    headers: token ? { authorization: "Bearer " + token } : {}
  });
}

function makeCatalogMock(options: { sourceError?: boolean; jobsError?: boolean; auditError?: boolean } = {}) {
  const sourceRows: Array<{ source_key: string; display_name: string; last_error: string | null }> = [];
  const jobRows: unknown[] = [];
  const auditRows: unknown[] = [];
  const updates: unknown[] = [];
  const sourceIds = [{ id: "source-r", source_key: "remotive" }, { id: "source-a", source_key: "arbeitnow" }];

  const client = {
    from: vi.fn((table: string) => {
      if (table === "job_sources") {
        const builder = {
          upsert: vi.fn((rows: Array<{ source_key: string; display_name: string; last_error: string | null }>) => {
            sourceRows.push(...rows);
            return builder;
          }),
          select: vi.fn(() => Promise.resolve({
            data: options.sourceError ? null : sourceIds,
            error: options.sourceError ? { code: "42P01" } : null
          })),
          update: vi.fn((row: unknown) => {
            updates.push(row);
            return { eq: vi.fn(() => Promise.resolve({ data: null, error: null })) };
          })
        };
        return builder;
      }
      if (table === "jobs") {
        return {
          upsert: vi.fn(async (rows: unknown[]) => {
            jobRows.push(...rows);
            return { error: options.jobsError ? { code: "42P01" } : null };
          })
        };
      }
      return {
        insert: vi.fn(async (row: unknown) => {
          auditRows.push(row);
          return { error: options.auditError ? { code: "42P01" } : null };
        })
      };
    })
  };

  return { client, sourceRows, jobRows, auditRows, updates };
}

function stubFeedResponses() {
  const responses = vi.fn(async (url: string) => {
    if (url.includes("remotive.com")) {
      return new Response(JSON.stringify({
        jobs: [{
          id: 101,
          title: "Python Developer",
          company_name: "Remote Co",
          url: "https://remotive.com/remote-jobs/software-dev/python-101",
          description: "Build APIs with Python and SQL.",
          candidate_required_location: "Worldwide",
          publication_date: "2026-10-20T12:00:00Z",
          category: "Software Development",
          job_type: "full_time"
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      data: [{
        slug: "typescript-engineer-berlin",
        title: "TypeScript Engineer",
        company_name: "Berlin Tech",
        url: "https://www.arbeitnow.com/view/typescript-engineer-berlin",
        description: "Build services with TypeScript and SQL.",
        remote: true,
        tags: ["Engineering", "TypeScript"],
        job_types: ["Full Time"],
        location: "Berlin, Germany",
        created_at: 1792490400
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", responses);
  return responses;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("protected scheduled job catalog sync", () => {
  it("fails closed when server-side configuration is absent", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("JOB_SYNC_CRON_SECRET", "");
    const upstream = stubFeedResponses();
    const response = await POST(request(syncSecret));
    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
    expect(vi.mocked(createClient)).not.toHaveBeenCalled();
  });

  it("rejects requests without the configured bearer secret", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    vi.stubEnv("JOB_SYNC_CRON_SECRET", syncSecret);
    const upstream = stubFeedResponses();
    const response = await POST(request("wrong-secret"));
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    expect(vi.mocked(createClient)).not.toHaveBeenCalled();
  });

  it("normalizes both providers, upserts the catalog, and logs a safe summary", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    vi.stubEnv("JOB_SYNC_CRON_SECRET", syncSecret);
    const upstream = stubFeedResponses();
    const mock = makeCatalogMock();
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const response = await POST(request(syncSecret));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.totalUpserted).toBe(2);
    expect(payload.providers.map((item: { source: string }) => item.source)).toEqual(["Remotive", "Arbeitnow"]);
    expect(mock.sourceRows).toHaveLength(2);
    expect(mock.jobRows).toHaveLength(2);
    expect(mock.jobRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ external_id: "101", source_id: "source-r" }),
      expect.objectContaining({ external_id: "typescript-engineer-berlin", source_id: "source-a" })
    ]));
    expect(mock.auditRows).toHaveLength(1);
    expect(JSON.stringify(mock.auditRows)).not.toContain(syncSecret);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("returns partial success when one provider fails and preserves existing catalog rows", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    vi.stubEnv("JOB_SYNC_CRON_SECRET", syncSecret);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("remotive.com")) return new Response("upstream failure", { status: 503 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));
    const mock = makeCatalogMock();
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const response = await POST(request(syncSecret));
    expect(response.status).toBe(207);
    const payload = await response.json();
    expect(payload.status).toBe("partial");
    expect(payload.warnings).toContain("Remotive could not be refreshed during this sync.");
    expect(payload.totalUpserted).toBe(0);
    expect(mock.auditRows).toHaveLength(1);
  });
});
