import { describe, expect, it } from "vitest";
import { explainJobMatch, scoreJob, type CandidateProfile, type Job } from "./scoring";

const candidate: CandidateProfile = {
  skills: ["Python", "SQL", "Git"],
  targetRoles: ["Junior Python Developer"],
  level: "entry",
  remoteOnly: true
};
const job: Job = {
  id: "1",
  title: "Junior Python Developer",
  company: "Example",
  location: "Remote",
  remote: true,
  skills: ["Python", "SQL", "Git"],
  level: "entry",
  description: "Example role",
  url: "https://example.com/job"
};

describe("job matching", () => {
  it("returns 100 for a full match", () => {
    expect(scoreJob(candidate, job)).toBe(100);
  });

  it("excludes non-remote roles when remote-only is enabled", () => {
    const explanation = explainJobMatch(candidate, { ...job, remote: false });
    expect(explanation.score).toBe(0);
    expect(explanation.excludedReason).toContain("remote-only");
  });

  it("explains missing skills on a partial match", () => {
    const explanation = explainJobMatch(candidate, { ...job, skills: ["Python", "Rust"] });
    expect(explanation.matchedSkills).toEqual(["Python"]);
    expect(explanation.missingSkills).toEqual(["Rust"]);
    expect(explanation.score).toBeGreaterThanOrEqual(0);
    expect(explanation.score).toBeLessThan(100);
  });

  it("does not count duplicate required skills twice", () => {
    const explanation = explainJobMatch(candidate, { ...job, skills: ["Python", "python", "SQL"] });
    expect(explanation.score).toBe(100);
    expect(explanation.matchedSkills).toHaveLength(2);
  });

  it("does not treat an empty target-role value as a role match", () => {
    const explanation = explainJobMatch({ ...candidate, targetRoles: [""] }, job);
    expect(explanation.roleMatch).toBe(false);
    expect(explanation.score).toBe(75);
  });

  it("handles an empty list of required skills without division errors", () => {
    const explanation = explainJobMatch(candidate, { ...job, skills: [] });
    expect(explanation.score).toBe(40);
    expect(explanation.matchedSkills).toEqual([]);
    expect(explanation.missingSkills).toEqual([]);
  });

  it("does not invent an experience-level match when the listing omits it", () => {
    const jobWithoutLevel: Job = { ...job, level: undefined };
    const explanation = explainJobMatch(candidate, jobWithoutLevel);
    expect(explanation.levelMatch).toBeNull();
    expect(explanation.score).toBe(95);
  });
});
