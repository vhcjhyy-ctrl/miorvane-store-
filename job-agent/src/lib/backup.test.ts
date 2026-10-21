import { describe, expect, it } from "vitest";
import { createJobAgentBackup, parseJobAgentBackup, type JobAgentProfileBackup } from "./backup";
import type { TrackedApplication } from "./application-tracker";
import type { Job } from "./scoring";

const profile: JobAgentProfileBackup = {
  schemaVersion: 3,
  candidateName: "Ahmed",
  skillsText: "Python, SQL",
  rolesText: "Python Developer",
  level: "entry",
  remoteOnly: true,
  minimumScore: 60,
  draftLanguage: "ar"
};
const job: Job = {
  id: "r1",
  title: "Python Developer",
  company: "Example GmbH",
  location: "Remote",
  remote: true,
  skills: ["Python"],
  description: "A role",
  url: "https://remotive.com/remote-jobs/product/python-dev",
  source: "Remotive"
};
const application: TrackedApplication = {
  job: { ...job, id: "r2" },
  status: "interview",
  updatedAt: "2026-10-21T10:00:00.000Z",
  notes: "Second interview",
  followUpDate: "2026-10-30"
};

describe("Job Agent JSON backup", () => {
  it("round-trips the profile, saved jobs and tracked application fields", () => {
    const backup = createJobAgentBackup(profile, [job], [application], "2026-10-21T12:00:00.000Z");
    const parsed = parseJobAgentBackup(JSON.parse(JSON.stringify(backup)));
    expect(parsed).not.toBeNull();
    expect(parsed?.profile.draftLanguage).toBe("ar");
    expect(parsed?.savedJobs.map(item => item.id)).toEqual(["r1"]);
    expect(parsed?.applications[0].notes).toBe("Second interview");
    expect(parsed?.applications[0].followUpDate).toBe("2026-10-30");
  });

  it("rejects the entire backup if a profile is malformed", () => {
    const backup = createJobAgentBackup(profile, [job], [application]);
    expect(parseJobAgentBackup({ ...backup, profile: { ...profile, minimumScore: 61 } })).toBeNull();
  });

  it("rejects unsafe listing URLs and invalid application details", () => {
    const backup = createJobAgentBackup(profile, [job], [application]);
    const unsafeJobs = { ...backup, savedJobs: [{ ...job, url: "javascript:alert(1)" }] };
    expect(parseJobAgentBackup(unsafeJobs)).toBeNull();

    const invalidDate = { ...backup, applications: [{ ...application, followUpDate: "2026-02-31" }] };
    expect(parseJobAgentBackup(invalidDate)).toBeNull();
  });

  it("rejects duplicate or over-limit records rather than silently truncating imports", () => {
    const backup = createJobAgentBackup(profile, [job], [application]);
    expect(parseJobAgentBackup({ ...backup, savedJobs: [job, job] })).toBeNull();
    const many = Array.from({ length: 101 }, (_, index) => ({ ...job, id: "job-" + index }));
    expect(parseJobAgentBackup({ ...backup, savedJobs: many })).toBeNull();
  });

  it("rejects unsupported schema versions and malformed export dates", () => {
    const backup = createJobAgentBackup(profile, [], []);
    expect(parseJobAgentBackup({ ...backup, schemaVersion: 99 })).toBeNull();
    expect(parseJobAgentBackup({ ...backup, exportedAt: "not-a-date" })).toBeNull();
  });
});
