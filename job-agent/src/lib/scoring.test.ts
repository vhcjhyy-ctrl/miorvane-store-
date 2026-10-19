import { describe, expect, it } from "vitest";
import { scoreJob, type CandidateProfile, type Job } from "./scoring";
const candidate: CandidateProfile = { skills: ["Python", "SQL", "Git"], targetRoles: ["Junior Python Developer"], level: "entry", remoteOnly: true };
const job: Job = { id: "1", title: "Junior Python Developer", company: "Example", location: "Remote", remote: true, skills: ["Python", "SQL", "Git"], level: "entry", description: "Example role", url: "https://example.com/job" };
describe("scoreJob", () => {
  it("returns 100 for a full match", () => expect(scoreJob(candidate, job)).toBe(100));
  it("rejects non-remote roles when remote-only is enabled", () => expect(scoreJob(candidate, { ...job, remote: false })).toBe(0));
  it("bounds partial matches", () => { const score = scoreJob(candidate, { ...job, skills: ["Python", "Rust"] }); expect(score).toBeGreaterThanOrEqual(0); expect(score).toBeLessThan(100); });
});
