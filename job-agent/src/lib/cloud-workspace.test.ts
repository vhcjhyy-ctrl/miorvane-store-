import { describe, expect, it } from "vitest";
import { parseCloudWorkspace, parseCloudWorkspaceWriteRequest } from "./cloud-workspace";

const profile = {
  schemaVersion: 3,
  candidateName: "Candidate",
  skillsText: "Python, SQL",
  rolesText: "Backend Developer",
  level: "entry",
  remoteOnly: true,
  minimumScore: 60,
  draftLanguage: "en"
};

const workspace = {
  profile,
  savedJobs: [{
    id: "remotive-1",
    title: "Python Developer",
    company: "Example",
    location: "Worldwide",
    remote: true,
    skills: ["Python"],
    description: "Build APIs.",
    url: "https://remotive.com/remote-jobs/software-dev/python-1",
    source: "Remotive"
  }],
  applications: [],
  savedSearches: [{
    id: "search-1",
    name: "Python",
    query: "Python Developer",
    source: "all",
    createdAt: "2026-10-21T10:00:00.000Z"
  }]
};

describe("cloud workspace validation", () => {
  it("normalizes a valid workspace and strips fields not in the validated schema", () => {
    const parsed = parseCloudWorkspace({
      ...workspace,
      cvText: "must not persist",
      profile: { ...profile, cvText: "not a profile field" }
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.profile).not.toHaveProperty("cvText");
    expect(parsed).not.toHaveProperty("cvText");
    expect(parsed?.savedJobs[0].id).toBe("remotive-1");
  });

  it("rejects missing arrays, invalid profile fields, and unsafe saved job URLs", () => {
    expect(parseCloudWorkspace({ ...workspace, savedSearches: undefined })).toBeNull();
    expect(parseCloudWorkspace({ ...workspace, profile: { ...profile, minimumScore: 61 } })).toBeNull();
    expect(parseCloudWorkspace({ ...workspace, savedJobs: [{ ...workspace.savedJobs[0], url: "javascript:alert(1)" }] })).toBeNull();
  });

  it("rejects records above backup limits instead of silently truncating data", () => {
    expect(parseCloudWorkspace({
      ...workspace,
      savedJobs: Array.from({ length: 101 }, (_, index) => ({
        ...workspace.savedJobs[0],
        id: "job-" + index,
        url: "https://example.com/jobs/" + index
      }))
    })).toBeNull();
    expect(parseCloudWorkspace({
      ...workspace,
      savedSearches: Array.from({ length: 21 }, (_, index) => ({
        id: "search-" + index,
        name: "Search " + index,
        query: "query " + index,
        source: "all",
        createdAt: "2026-10-21T10:00:00.000Z"
      }))
    })).toBeNull();
  });

  it("validates optimistic workspace versions and required payload shape", () => {
    expect(parseCloudWorkspaceWriteRequest({ expectedVersion: 0, workspace })).not.toBeNull();
    expect(parseCloudWorkspaceWriteRequest({ expectedVersion: -1, workspace })).toBeNull();
    expect(parseCloudWorkspaceWriteRequest({ expectedVersion: 1.5, workspace })).toBeNull();
    expect(parseCloudWorkspaceWriteRequest({ expectedVersion: 1, workspace: {} })).toBeNull();
  });
});
