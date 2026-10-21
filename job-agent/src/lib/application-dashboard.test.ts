import { describe, expect, it } from "vitest";
import { filterApplicationsByStatus, summarizeApplications } from "./application-dashboard";
import type { TrackedApplication } from "./application-tracker";

const makeApplication = (
  id: string,
  status: TrackedApplication["status"],
  followUpDate?: string
): TrackedApplication => ({
  job: {
    id,
    title: "Role " + id,
    company: "Company",
    location: "Remote",
    remote: true,
    skills: [],
    description: "Role description",
    url: "https://example.com/jobs/" + id
  },
  status,
  updatedAt: "2026-10-21T08:00:00.000Z",
  ...(followUpDate ? { followUpDate } : {})
});

describe("application dashboard summary", () => {
  const applications = [
    makeApplication("1", "applied", "2026-10-20"),
    makeApplication("2", "interview", "2026-10-21"),
    makeApplication("3", "rejected", "2026-10-19"),
    makeApplication("4", "offer"),
    makeApplication("5", "interested")
  ];

  it("counts stages and only active follow-ups", () => {
    expect(summarizeApplications(applications, "2026-10-21")).toEqual({
      total: 5,
      interested: 1,
      preparing: 0,
      applied: 1,
      interviews: 1,
      offers: 1,
      rejected: 1,
      withdrawn: 0,
      followUpsDue: 2,
      followUpsOverdue: 1
    });
  });

  it("filters records by status and returns a copy for all statuses", () => {
    expect(filterApplicationsByStatus(applications, "interview").map(item => item.job.id)).toEqual(["2"]);
    const all = filterApplicationsByStatus(applications, "all");
    expect(all).toEqual(applications);
    expect(all).not.toBe(applications);
  });

  it("returns zero counts for an empty tracker", () => {
    expect(summarizeApplications([], "2026-10-21").total).toBe(0);
    expect(summarizeApplications([], "2026-10-21").followUpsDue).toBe(0);
  });
});
