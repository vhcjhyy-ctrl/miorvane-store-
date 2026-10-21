import { describe, expect, it } from "vitest";
import { filterAndSortMatches, type JobResultFilters, type ScoredJob } from "./job-results";
import type { Job } from "./scoring";

const now = Date.parse("2026-10-21T12:00:00.000Z");
const makeMatch = (
  id: string,
  overrides: Partial<Job> = {},
  score = 50
): ScoredJob => ({
  job: {
    id,
    title: id,
    company: "Company " + id,
    location: "Remote",
    remote: true,
    skills: [],
    level: undefined,
    description: "Description",
    url: "https://example.com/jobs/" + id,
    ...overrides
  },
  explanation: {
    score,
    matchedSkills: [],
    missingSkills: [],
    roleMatch: false,
    levelMatch: null
  }
});

const filters: JobResultFilters = {
  category: "all",
  jobType: "all",
  postedWithin: "any",
  salaryOnly: false,
  sortBy: "match"
};

describe("job result filters and sorting", () => {
  const matches = [
    makeMatch("a", { category: "Engineering", jobType: "full_time", salary: "$80k", publishedAt: "2026-10-20T12:00:00Z" }, 70),
    makeMatch("b", { category: "Design", jobType: "contract", publishedAt: "2026-10-18T12:00:00Z" }, 95),
    makeMatch("c", { category: "Engineering", jobType: "full_time", publishedAt: "2026-09-01T12:00:00Z" }, 85),
    makeMatch("d", { category: "Engineering", jobType: "part_time" }, 60)
  ];

  it("filters by category and job type case-insensitively", () => {
    const result = filterAndSortMatches(matches, { ...filters, category: "engineering", jobType: "FULL_TIME" }, now);
    expect(result.map(item => item.job.id)).toEqual(["c", "a"]);
  });

  it("can limit to roles with a listed salary", () => {
    const result = filterAndSortMatches(matches, { ...filters, salaryOnly: true }, now);
    expect(result.map(item => item.job.id)).toEqual(["a"]);
  });

  it("filters recent listings and excludes missing or future publication dates", () => {
    const recent = filterAndSortMatches(matches, { ...filters, postedWithin: "7" }, now);
    expect(recent.map(item => item.job.id)).toEqual(["b", "a"]);
  });

  it("sorts newest first and leaves undated listings last", () => {
    const result = filterAndSortMatches(matches, { ...filters, sortBy: "newest" }, now);
    expect(result.map(item => item.job.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts by employer name when requested", () => {
    const result = filterAndSortMatches(matches, { ...filters, sortBy: "company" }, now);
    expect(result.map(item => item.job.company)).toEqual(["Company a", "Company b", "Company c", "Company d"]);
  });

  it("does not mutate the caller's array", () => {
    const original = [...matches];
    filterAndSortMatches(matches, { ...filters, sortBy: "newest" }, now);
    expect(matches).toEqual(original);
  });
});
