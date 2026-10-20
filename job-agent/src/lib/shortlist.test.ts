import { describe, expect, it } from "vitest";
import { readShortlist, toggleShortlist } from "./shortlist";
import type { Job } from "./scoring";

const job: Job = {
  id: "remotive-12",
  title: "Python Developer",
  company: "Example",
  location: "Worldwide",
  remote: true,
  skills: ["Python"],
  level: "mid",
  description: "A role",
  url: "https://remotive.com/remote-jobs/product/python-developer-12",
  source: "Remotive"
};

describe("browser-local shortlist", () => {
  it("adds a job and removes it when toggled again", () => {
    expect(toggleShortlist([], job)).toEqual([job]);
    expect(toggleShortlist([job], job)).toEqual([]);
  });

  it("handles missing or corrupt local storage without throwing", () => {
    expect(readShortlist(null)).toEqual([]);
    expect(readShortlist("{broken-json")).toEqual([]);
    expect(readShortlist(JSON.stringify({ jobs: [job] }))).toEqual([]);
  });

  it("discards unsafe or malformed entries and deduplicates valid ids", () => {
    const parsed = readShortlist(JSON.stringify([
      job,
      { ...job, company: "Updated company" },
      { ...job, id: "bad", url: "javascript:alert(1)" },
      { ...job, id: "missing-title", title: "" }
    ]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].company).toBe("Updated company");
  });

  it("keeps at most 100 recent entries", () => {
    const many = Array.from({ length: 110 }, (_, index) => ({ ...job, id: "job-" + index }));
    const parsed = readShortlist(JSON.stringify(many));
    expect(parsed).toHaveLength(100);
    expect(parsed[0].id).toBe("job-10");
    expect(parsed.at(-1)?.id).toBe("job-109");
  });
});
