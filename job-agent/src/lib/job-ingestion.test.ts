import { describe, expect, it } from "vitest";
import { dedupeJobsBySource, isJobSyncAuthorized, toCatalogJobRow } from "./job-ingestion";
import type { Job } from "./scoring";

const secret = "a".repeat(48);
const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: "remotive-123",
  title: "Python Developer",
  company: "Example",
  location: "Worldwide",
  remote: true,
  skills: ["Python", " Python ", "SQL"],
  description: "Build APIs",
  url: "https://remotive.com/remote-jobs/software-dev/python-123",
  source: "Remotive",
  level: "entry",
  publishedAt: "2026-10-20T10:00:00.000Z",
  ...overrides
});

describe("job ingestion safety and catalog mapping", () => {
  it("requires a sufficiently long bearer secret and compares it before running a sync", () => {
    expect(isJobSyncAuthorized("Bearer " + secret, secret)).toBe(true);
    expect(isJobSyncAuthorized("Bearer wrong", secret)).toBe(false);
    expect(isJobSyncAuthorized(secret, secret)).toBe(false);
    expect(isJobSyncAuthorized("Bearer " + secret, "short")).toBe(false);
    expect(isJobSyncAuthorized("Bearer " + secret, undefined)).toBe(false);
    expect(isJobSyncAuthorized("Bearer " + secret, secret + "x")).toBe(false);
  });

  it("maps normalized Remotive jobs to the catalog without losing the provider identity", () => {
    const row = toCatalogJobRow(makeJob(), "source-id", "2026-10-21T12:00:00.000Z");
    expect(row).toMatchObject({
      source_id: "source-id",
      external_id: "123",
      canonical_url: "https://remotive.com/remote-jobs/software-dev/python-123",
      title: "Python Developer",
      active: true
    });
    expect(row?.skills).toEqual(["Python", "SQL"]);
    expect(row?.published_at).toBe("2026-10-20T10:00:00.000Z");
  });

  it("maps Arbeitnow IDs and tolerates missing optional date and level", () => {
    const row = toCatalogJobRow(makeJob({
      id: "arbeitnow-python-berlin",
      source: "Arbeitnow",
      url: "https://www.arbeitnow.com/view/python-berlin",
      level: undefined,
      publishedAt: undefined
    }), "arbeitnow-source", "2026-10-21T12:00:00.000Z");
    expect(row?.external_id).toBe("python-berlin");
    expect(row?.experience_level).toBeNull();
    expect(row?.published_at).toBeNull();
  });

  it("rejects unsupported provider IDs, insecure URLs, and missing source identity", () => {
    expect(toCatalogJobRow(makeJob({ id: "unknown-1", source: "Other" }), "s1", "2026-10-21T12:00:00Z")).toBeNull();
    expect(toCatalogJobRow(makeJob({ url: "http://remotive.com/remote-jobs/test" }), "s1", "2026-10-21T12:00:00Z")).toBeNull();
    expect(toCatalogJobRow(makeJob(), "", "2026-10-21T12:00:00Z")).toBeNull();
    expect(toCatalogJobRow(makeJob(), "s1", "invalid")).toBeNull();
  });

  it("deduplicates stable provider IDs without collapsing different providers", () => {
    const jobs = [
      makeJob(),
      makeJob(),
      makeJob({ id: "arbeitnow-123", source: "Arbeitnow", url: "https://www.arbeitnow.com/view/123" })
    ];
    expect(dedupeJobsBySource(jobs).map(job => job.source)).toEqual(["Remotive", "Arbeitnow"]);
  });
});
