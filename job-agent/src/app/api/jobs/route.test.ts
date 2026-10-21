import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const remotiveRecord = (id: number, title = "Python Developer") => ({
  id,
  title,
  company_name: "Remote Co " + id,
  url: "https://remotive.com/remote-jobs/software-dev/python-developer-" + id,
  description: "Build Python APIs and cloud services.",
  category: "Software Development",
  candidate_required_location: "Worldwide",
  salary: "$80,000–$100,000",
  publication_date: "2026-10-19T12:00:00Z",
  job_type: "full_time"
});

const arbeitnowRecord = (id: number, title = "Python Backend Developer") => ({
  slug: "python-backend-developer-" + id,
  title,
  company_name: "Berlin Tech " + id,
  url: "https://www.arbeitnow.com/view/python-backend-developer-" + id,
  description: "Build backend services with Python and SQL.",
  remote: true,
  tags: ["Engineering", "Python"],
  job_types: ["Full Time"],
  location: "Berlin, Germany",
  created_at: Date.parse("2026-10-19T12:00:00Z") / 1000
});

type ProviderStub = { status: number; payload: unknown };

function stubProviders(options: { remotive?: ProviderStub; arbeitnow?: ProviderStub } = {}) {
  const remotive: ProviderStub = options.remotive ?? {
    status: 200,
    payload: { jobs: [remotiveRecord(1)] }
  };
  const arbeitnow: ProviderStub = options.arbeitnow ?? {
    status: 200,
    payload: { data: [arbeitnowRecord(1)] }
  };

  const mock = vi.fn(async (url: string) => {
    const provider = url.includes("remotive.com") ? remotive : arbeitnow;
    return new Response(JSON.stringify(provider.payload), {
      status: provider.status,
      headers: { "content-type": "application/json" }
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function searchRequest(query = "python", source = "all", limit = 25) {
  return new Request(
    "http://localhost/api/jobs?q=" + encodeURIComponent(query) +
      "&source=" + encodeURIComponent(source) +
      "&limit=" + encodeURIComponent(String(limit))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live job search API route", () => {
  it("rejects unsupported source names before contacting providers", async () => {
    const fetchMock = stubProviders();
    const response = await GET(searchRequest("python", "linkedin"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Choose a supported job source." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("merges both sources and returns source attribution and cache metadata", async () => {
    const fetchMock = stubProviders();
    const response = await GET(searchRequest("python", "all", 10));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.total).toBe(2);
    expect(payload.jobs.map((job: { source: string }) => job.source)).toEqual(["Remotive", "Arbeitnow"]);
    expect(payload.sources).toEqual(["Remotive", "Arbeitnow"]);
    expect(payload.sourceLinks.Remotive).toContain("remotive.com");
    expect(payload.sourceLinks.Arbeitnow).toContain("arbeitnow.com");
    expect(payload.cacheHours).toMatchObject({ Remotive: 6, Arbeitnow: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls only the selected provider and respects a one-result limit", async () => {
    const fetchMock = stubProviders({
      remotive: {
        status: 200,
        payload: { jobs: [remotiveRecord(1), remotiveRecord(2, "Python Platform Engineer")] }
      }
    });
    const response = await GET(searchRequest("python", "remotive", 1));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.total).toBe(1);
    expect(payload.jobs[0].source).toBe("Remotive");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("remotive.com");
  });

  it("returns partial results with a warning when one provider is unavailable", async () => {
    stubProviders({
      remotive: { status: 503, payload: { error: "upstream details must not leak" } }
    });
    const response = await GET(searchRequest("python", "all"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.jobs.map((job: { source: string }) => job.source)).toEqual(["Arbeitnow"]);
    expect(payload.warnings).toEqual(["Remotive is temporarily unavailable."]);
    expect(JSON.stringify(payload)).not.toContain("upstream details must not leak");
  });

  it("returns a safe 502 when every selected provider is unavailable", async () => {
    stubProviders({
      remotive: { status: 503, payload: {} },
      arbeitnow: { status: 503, payload: {} }
    });
    const response = await GET(searchRequest("python", "all"));
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.warnings).toEqual([
      "Remotive is temporarily unavailable.",
      "Arbeitnow is temporarily unavailable."
    ]);
  });

  it("treats malformed provider payloads as a provider outage without losing healthy results", async () => {
    stubProviders({
      remotive: { status: 200, payload: { unexpected: [] } }
    });
    const response = await GET(searchRequest("python", "all"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.jobs.map((job: { source: string }) => job.source)).toEqual(["Arbeitnow"]);
    expect(payload.warnings).toContain("Remotive is temporarily unavailable.");
  });

  it("clamps an excessive combined result limit to fifty", async () => {
    stubProviders({
      remotive: {
        status: 200,
        payload: { jobs: Array.from({ length: 50 }, (_, index) => remotiveRecord(index + 1, "Python Developer " + index)) }
      },
      arbeitnow: {
        status: 200,
        payload: { data: Array.from({ length: 50 }, (_, index) => arbeitnowRecord(index + 1, "Python Engineer " + index)) }
      }
    });
    const response = await GET(searchRequest("python", "all", 1000));
    expect(response.status).toBe(200);
    expect((await response.json()).total).toBe(50);
  });
});
