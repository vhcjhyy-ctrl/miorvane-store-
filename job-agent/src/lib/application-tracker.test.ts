import { describe, expect, it } from "vitest";
import {
  readApplicationTracker,
  updateApplicationTracker,
  updateTrackedApplicationDetails,
  type TrackedApplication
} from "./application-tracker";
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

    const withNotes = updateTrackedApplicationDetails(added, job, "notes", "Ask about team structure.");
    const withDate = updateTrackedApplicationDetails(withNotes, job, "followUpDate", "2026-10-30");
    const updated = updateApplicationTracker(withDate, job, "applied", "2026-10-21T12:00:00.000Z");
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe("applied");
    expect(updated[0].notes).toBe("Ask about team structure.");
    expect(updated[0].followUpDate).toBe("2026-10-30");

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

  it("validates date-only follow-ups and caps notes length", () => {
    const added = updateApplicationTracker([], job, "interested", "2026-10-20T12:00:00.000Z");
    expect(updateTrackedApplicationDetails(added, job, "followUpDate", "2026-02-31")).toEqual(added);
    const withDate = updateTrackedApplicationDetails(added, job, "followUpDate", "2026-10-30");
    expect(withDate[0].followUpDate).toBe("2026-10-30");
    const cleared = updateTrackedApplicationDetails(withDate, job, "followUpDate", "");
    expect(cleared[0].followUpDate).toBeUndefined();
    const notes = updateTrackedApplicationDetails(cleared, job, "notes", "x".repeat(2500));
    expect(notes[0].notes).toHaveLength(2000);
  });

  it("restores valid notes and dates but rejects malformed detail fields", () => {
    const stored = [
      { ...entry, notes: "Recruiter emailed", followUpDate: "2026-10-25" },
      { ...entry, job: { ...job, id: "bad-date" }, followUpDate: "2026-02-31" },
      { ...entry, job: { ...job, id: "long-notes" }, notes: "x".repeat(2001) }
    ];
    const parsed = readApplicationTracker(JSON.stringify(stored));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].notes).toBe("Recruiter emailed");
    expect(parsed[0].followUpDate).toBe("2026-10-25");
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
