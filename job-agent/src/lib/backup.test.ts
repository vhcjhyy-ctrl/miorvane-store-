import { describe, expect, it } from "vitest";
import { createJobAgentBackup, parseJobAgentBackup, restoreJobAgentBackupToStorage, type JobAgentBackupStorage, type JobAgentProfileBackup } from "./backup";
import type { TrackedApplication } from "./application-tracker";
import type { Job } from "./scoring";
import type { SavedJobSearch } from "./saved-searches";

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
const savedSearch: SavedJobSearch = {
  id: "search-python",
  name: "Remote Python",
  query: "Python Developer",
  source: "all",
  createdAt: "2026-10-21T09:00:00.000Z"
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
    const backup = createJobAgentBackup(profile, [job], [application], [savedSearch], "2026-10-21T12:00:00.000Z");
    const parsed = parseJobAgentBackup(JSON.parse(JSON.stringify(backup)));
    expect(parsed).not.toBeNull();
    expect(parsed?.profile.draftLanguage).toBe("ar");
    expect(parsed?.savedJobs.map(item => item.id)).toEqual(["r1"]);
    expect(parsed?.applications[0].notes).toBe("Second interview");
    expect(parsed?.applications[0].followUpDate).toBe("2026-10-30");
    expect(parsed?.savedSearches).toEqual([savedSearch]);
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

  it("restores previous app data if any storage write fails", () => {
    const before = new Map<string, string>([
      ["job-agent.profile.v3", '{"old":"profile"}'],
      ["job-agent.profile.v2", '{"legacy":"profile"}'],
      ["job-agent.shortlist.v1", '[{"old":"shortlist"}]'],
      ["job-agent.applications.v1", '[{"old":"applications"}]']
    ]);
    const snapshotBefore = new Map(before);
    let writes = 0;
    let failOnWrite = true;
    const storage: JobAgentBackupStorage = {
      getItem(key) { return before.get(key) ?? null; },
      setItem(key, value) {
        writes += 1;
        if (failOnWrite && writes === 2) {
          failOnWrite = false;
          throw new Error("Quota exceeded");
        }
        before.set(key, value);
      },
      removeItem(key) { before.delete(key); }
    };
    const backup = createJobAgentBackup(profile, [job], [application]);
    expect(() => restoreJobAgentBackupToStorage(storage, backup)).toThrow("Quota exceeded");
    expect(before).toEqual(snapshotBefore);
  });

  it("writes the new profile and records and removes legacy profile keys", () => {
    const data = new Map<string, string>([
      ["job-agent.profile.v2", '{"schemaVersion":2}'],
      ["job-agent.profile.v1", '{"schemaVersion":1}']
    ]);
    const storage: JobAgentBackupStorage = {
      getItem(key) { return data.get(key) ?? null; },
      setItem(key, value) { data.set(key, value); },
      removeItem(key) { data.delete(key); }
    };
    const backup = createJobAgentBackup(profile, [job], [application], [savedSearch]);
    restoreJobAgentBackupToStorage(storage, backup);
    expect(JSON.parse(data.get("job-agent.profile.v3") ?? "null")).toEqual(profile);
    expect(JSON.parse(data.get("job-agent.shortlist.v1") ?? "null")).toHaveLength(1);
    expect(JSON.parse(data.get("job-agent.applications.v1") ?? "null")).toHaveLength(1);
    expect(JSON.parse(data.get("job-agent.saved-searches.v1") ?? "null")).toHaveLength(1);
    expect(data.has("job-agent.profile.v2")).toBe(false);
    expect(data.has("job-agent.profile.v1")).toBe(false);
  });

  it("imports legacy v1 backups with an empty saved-search list", () => {
    const modern = createJobAgentBackup(profile, [job], [application], [savedSearch]);
    const legacyPayload = {
      schemaVersion: 1,
      exportedAt: modern.exportedAt,
      profile: modern.profile,
      savedJobs: modern.savedJobs,
      applications: modern.applications
    };
    const parsed = parseJobAgentBackup(legacyPayload);
    expect(parsed?.schemaVersion).toBe(2);
    expect(parsed?.savedSearches).toEqual([]);
  });

  it("rejects malformed or over-limit saved-search records", () => {
    const backup = createJobAgentBackup(profile, [], [], [savedSearch]);
    expect(parseJobAgentBackup({ ...backup, savedSearches: [{ ...savedSearch, source: "unknown" }] })).toBeNull();
    expect(parseJobAgentBackup({
      ...backup,
      savedSearches: Array.from({ length: 21 }, (_, index) => ({ ...savedSearch, id: "s" + index, query: "Query " + index }))
    })).toBeNull();
  });

  it("rejects unsupported schema versions and malformed export dates", () => {
    const backup = createJobAgentBackup(profile, [], []);
    expect(parseJobAgentBackup({ ...backup, schemaVersion: 99 })).toBeNull();
    expect(parseJobAgentBackup({ ...backup, exportedAt: "not-a-date" })).toBeNull();
  });
});
