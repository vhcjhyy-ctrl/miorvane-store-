import { describe, expect, it } from "vitest";
import { analyzeCvJobFit } from "./cv-fit";
import type { Job } from "./scoring";

const job: Job = {
  id: "python-backend",
  title: "Backend Developer",
  company: "Example Systems",
  location: "Remote",
  remote: true,
  skills: ["Python", "Docker", "python"],
  description: "Build APIs with Python and SQL. Deployment uses Docker.",
  url: "https://example.com/jobs/python-backend"
};

describe("local CV-to-job keyword comparison", () => {
  it("compares detected CV skills with role skills without changing the job", () => {
    const originalJob = { ...job, skills: [...job.skills] };
    const result = analyzeCvJobFit(
      "Work experience: Built services using PYTHON, SQL, and Git. Familiar with TypeScript.",
      job
    );

    expect(result.detectedResumeSkills).toEqual(expect.arrayContaining(["Python", "SQL", "Git", "TypeScript"]));
    expect(result.requiredSkills).toEqual(["Python", "Docker", "SQL"]);
    expect(result.matchedSkills).toEqual(["Python", "SQL"]);
    expect(result.missingSkills).toEqual(["Docker"]);
    expect(result.coveragePercent).toBe(67);
    expect(job).toEqual(originalJob);
  });

  it("normalizes case and whitespace and deduplicates job skill names", () => {
    const result = analyzeCvJobFit("python   SQL", {
      ...job,
      skills: [" PYTHON ", "Python", " sql "],
      description: "Python services."
    });
    expect(result.requiredSkills).toEqual(["PYTHON", "sql"]);
    expect(result.matchedSkills).toEqual(["PYTHON", "sql"]);
    expect(result.missingSkills).toEqual([]);
    expect(result.coveragePercent).toBe(100);
  });

  it("does not invent a score when no recognized skills appear in the listing", () => {
    const result = analyzeCvJobFit("I am a motivated person.", {
      ...job,
      skills: [],
      description: "Join our friendly team."
    });
    expect(result.requiredSkills).toEqual([]);
    expect(result.matchedSkills).toEqual([]);
    expect(result.missingSkills).toEqual([]);
    expect(result.coveragePercent).toBeNull();
  });

  it("treats an empty or unrecognized CV as no detected skills", () => {
    const result = analyzeCvJobFit("", job);
    expect(result.detectedResumeSkills).toEqual([]);
    expect(result.matchedSkills).toEqual([]);
    expect(result.missingSkills).toEqual(["Python", "Docker", "SQL"]);
    expect(result.coveragePercent).toBe(0);
  });
});
