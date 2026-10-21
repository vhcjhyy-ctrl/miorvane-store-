import { describe, expect, it } from "vitest";
import { applicationTrackerToCsv } from "./application-export";
import type { TrackedApplication } from "./application-tracker";
import type { Job } from "./scoring";

const job: Job = {
  id: "remotive-12",
  title: "Python Developer",
  company: 'Example, "Systems"',
  location: "Worldwide",
  remote: true,
  skills: ["Python"],
  level: "mid",
  description: "Role",
  url: "https://remotive.com/remote-jobs/product/python-developer-12",
  source: "Remotive",
  salary: "$80k–$100k",
  publishedAt: "2026-10-20T12:00:00.000Z"
};
const application: TrackedApplication = {
  job,
  status: "applied",
  updatedAt: "2026-10-21T12:00:00.000Z"
};

describe("application tracker CSV export", () => {
  it("returns a header row for an empty tracker", () => {
    expect(applicationTrackerToCsv([])).toBe(
      '"job_title","company","status","last_updated","location","salary","published_at","source","job_url"\r\n'
    );
  });

  it("escapes commas and quote characters using CSV rules", () => {
    const csv = applicationTrackerToCsv([application]);
    expect(csv).toContain('"Example, ""Systems"""');
    expect(csv).toContain('"$80k–$100k"');
    expect(csv).toContain('"applied"');
  });

  it("neutralizes spreadsheet formula prefixes in exported text cells", () => {
    const malicious: TrackedApplication = {
      ...application,
      job: { ...job, title: '=HYPERLINK("https://attacker.example","click")' }
    };
    expect(applicationTrackerToCsv([malicious])).toContain('"\'=HYPERLINK(""https://attacker.example"",""click"")"');
  });

  it("produces consistent CRLF row endings and includes the original listing URL", () => {
    const csv = applicationTrackerToCsv([application]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain('"https://remotive.com/remote-jobs/product/python-developer-12"');
  });
});
