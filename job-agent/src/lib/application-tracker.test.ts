import { describe, expect, it } from "vitest";
import { readApplicationTracker, updateApplicationTracker, type TrackedApplication } from "./application-tracker";
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

const entry: TrackedApplication = {
  job,
  status: "interested",
  updatedAt: "2026-10-20T12:00:00.000Z"
};

describe("browser-local application tracker", () => {
  it("adds a tracked status, updates the same role, and clears the role", () => {
    const added = updateApplicationTracker([], job, "interested", "2026-10-20T12:00:00.000Z");
    expect(added).toEqual([entry]);

    const updated = updateApplicationTracker(added, job, "applied", "2026-10-21T12:00:00.000Z");
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe("applied");

    expect(updateApplicationTracker(updated, job, "")).toEqual([]);
  });

  it("handles missing, corrupt, and wrong-shaped storage without throwing", () => {
    expect(readApplicationTracker(null)).toEqual([]);
    expect(readApplicationTracker("{broken-json")).toEqual([]);
    expect(readApplicationTracker(JSON.stringify({ applications: [entry] }))).toEqual([]);
  });

  it("discards unsafe, invalid, or duplicate entries", () => {
    const parsed = readApplicationTracker(JSON.stringify([
      entry,
      { ...entry, status: "send-automatically" },
      { ...entry, job: { ...job, url: "javascript:alert(1)" } },
      { ...entry, updatedAt: "not-a-date" },
      { ...entry, status: "applied", updatedAt: "2026-10-21T12:00:00.000Z" }
    ]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].status).toBe("applied");
  });

  it("keeps only the most recent 100 entries", () => {
    const many: TrackedApplication[] = Array.from({ length: 110 }, (_, index) => ({
      job: { ...job, id: "job-" + index },
      status: "interested",
      updatedAt: "2026-10-20T12:00:00.000Z"
    }));
    const parsed = readApplicationTracker(JSON.stringify(many));
    expect(parsed).toHaveLength(100);
    expect(parsed[0].job.id).toBe("job-10");
    expect(parsed.at(-1)?.job.id).toBe("job-109");
  });
});
