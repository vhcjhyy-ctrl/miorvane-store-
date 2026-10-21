import { describe, expect, it } from "vitest";
import {
  MAX_SAVED_JOB_SEARCHES,
  readSavedJobSearches,
  removeSavedJobSearch,
  upsertSavedJobSearch,
  type SavedJobSearch
} from "./saved-searches";

const makeSearch = (
  id: string,
  query: string,
  source: SavedJobSearch["source"] = "all",
  name = query,
  createdAt = "2026-10-21T10:00:00.000Z"
): SavedJobSearch => ({ id, query, source, name, createdAt });

describe("browser-local saved job searches", () => {
  it("stores valid searches and normalizes the creation timestamp", () => {
    const saved = readSavedJobSearches(JSON.stringify([
      makeSearch("s1", "Python   developer", "all", "Python jobs", "2026-10-21T10:00:00Z")
    ]));
    expect(saved).toEqual([makeSearch("s1", "Python developer", "all", "Python jobs")]);
  });

  it("rejects malformed storage, unsupported sources, invalid dates, and overlong fields", () => {
    expect(readSavedJobSearches("{broken")).toEqual([]);
    expect(readSavedJobSearches(JSON.stringify([
      { ...makeSearch("bad-source", "Python"), source: "linkedin" },
      { ...makeSearch("bad-date", "Data analyst"), createdAt: "yesterday-ish" },
      makeSearch("too-long", "q".repeat(81))
    ]))).toEqual([]);
  });

  it("deduplicates equivalent queries for the same source, but keeps different sources", () => {
    const result = readSavedJobSearches(JSON.stringify([
      makeSearch("s1", "  Python   Developer ", "all"),
      makeSearch("s2", "python developer", "all"),
      makeSearch("s3", "python developer", "remotive")
    ]));
    expect(result.map(item => item.id)).toEqual(["s1", "s3"]);
  });

  it("updates a duplicate search in place without changing its stable id or creation date", () => {
    const current = [makeSearch("s1", "Python developer", "all", "First name", "2026-10-01T00:00:00Z")];
    const updated = upsertSavedJobSearch(current, makeSearch("s2", " python   developer ", "all", "Updated name"));
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: "s1",
      name: "Updated name",
      createdAt: "2026-10-01T00:00:00.000Z"
    });
  });

  it("limits storage to twenty entries and removes one search by id", () => {
    const searches = Array.from({ length: MAX_SAVED_JOB_SEARCHES + 4 }, (_, index) =>
      makeSearch("s" + index, "Query " + index)
    );
    const parsed = readSavedJobSearches(JSON.stringify(searches));
    expect(parsed).toHaveLength(MAX_SAVED_JOB_SEARCHES);
    const removed = removeSavedJobSearch(parsed, "s4");
    expect(removed).toHaveLength(MAX_SAVED_JOB_SEARCHES - 1);
    expect(removed.some(item => item.id === "s4")).toBe(false);
  });

  it("does not mutate caller-owned arrays", () => {
    const current = [makeSearch("s1", "Python")];
    const snapshot = [...current];
    upsertSavedJobSearch(current, makeSearch("s2", "Analyst"));
    expect(current).toEqual(snapshot);
  });
});
