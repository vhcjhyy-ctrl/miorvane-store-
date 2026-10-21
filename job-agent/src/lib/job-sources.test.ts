import { describe, expect, it } from "vitest";
import { mergeJobSources } from "./job-sources";
import type { Job } from "./scoring";

const makeJob = (id: string, title: string, company = "Company " + id, location = "Remote", source = "Remotive"): Job => ({
  id,
  title,
  company,
  location,
  remote: true,
  skills: [],
  description: "Role description",
  url: "https://example.com/jobs/" + id,
  source
});

describe("multi-source job merge", () => {
  it("interleaves both providers when both have results", () => {
    const remotive = [makeJob("r1", "Role R1"), makeJob("r2", "Role R2")];
    const arbeitnow = [makeJob("a1", "Role A1", "Company A1", "Berlin", "Arbeitnow"), makeJob("a2", "Role A2", "Company A2", "Munich", "Arbeitnow")];
    expect(mergeJobSources(remotive, arbeitnow, 4).map(job => job.id)).toEqual(["r1", "a1", "r2", "a2"]);
  });

  it("deduplicates by normalized title, company, and location across sources", () => {
    const remotive = [makeJob("r1", "Senior Python Engineer", "Example GmbH", "Berlin")];
    const arbeitnow = [
      makeJob("a1", " senior python engineer ", "EXAMPLE GMBH", " Berlin ", "Arbeitnow"),
      makeJob("a2", "Backend Engineer", "Other GmbH", "Hamburg", "Arbeitnow")
    ];
    expect(mergeJobSources(remotive, arbeitnow, 10).map(job => job.id)).toEqual(["r1", "a2"]);
  });

  it("deduplicates before applying the final result limit", () => {
    const remotive = [
      makeJob("r1", "Role One", "Same Company", "Remote"),
      makeJob("r2", "Role Two", "Another Company", "Remote")
    ];
    const arbeitnow = [
      makeJob("a1", "Role One", "Same Company", "Remote", "Arbeitnow"),
      makeJob("a2", "Role Three", "Third Company", "Remote", "Arbeitnow")
    ];
    expect(mergeJobSources(remotive, arbeitnow, 3).map(job => job.id)).toEqual(["r1", "a2", "r2"]);
  });

  it("supports a single provider and caps output at the requested limit", () => {
    const jobs = Array.from({ length: 10 }, (_, index) => makeJob("r" + index, "Role " + index));
    expect(mergeJobSources(jobs, [], 3).map(job => job.id)).toEqual(["r0", "r1", "r2"]);
    expect(mergeJobSources([], jobs, 2).map(job => job.id)).toEqual(["r0", "r1"]);
  });
});
