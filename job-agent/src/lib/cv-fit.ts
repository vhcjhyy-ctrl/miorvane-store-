import type { Job } from "./scoring";
import { extractKnownSkills } from "./remotive";

export interface CvJobFit {
  detectedResumeSkills: string[];
  requiredSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  coveragePercent: number | null;
}

function normalizeSkill(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function uniqueSkills(values: string[]): string[] {
  const found = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.normalize("NFKC").replace(/\s+/g, " ").trim();
    const key = normalizeSkill(clean);
    if (!key || found.has(key)) continue;
    found.add(key);
    result.push(clean);
  }
  return result;
}

/**
 * Compare only skills recognized by the app's fixed vocabulary. This is a local
 * keyword aid, not an ATS score or evidence that a candidate lacks a skill.
 */
export function analyzeCvJobFit(resumeText: string, job: Job): CvJobFit {
  const detectedResumeSkills = uniqueSkills(extractKnownSkills(resumeText));
  const skillsFromListing = extractKnownSkills([
    job.title,
    job.description,
    job.category ?? "",
    job.jobType ?? ""
  ].join(" "));
  const requiredSkills = uniqueSkills([...job.skills, ...skillsFromListing]);
  const resumeSet = new Set(detectedResumeSkills.map(normalizeSkill));
  const matchedSkills = requiredSkills.filter(skill => resumeSet.has(normalizeSkill(skill)));
  const missingSkills = requiredSkills.filter(skill => !resumeSet.has(normalizeSkill(skill)));

  return {
    detectedResumeSkills,
    requiredSkills,
    matchedSkills,
    missingSkills,
    coveragePercent: requiredSkills.length
      ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
      : null
  };
}
