export type ExperienceLevel = "entry" | "mid" | "senior";

export interface CandidateProfile {
  skills: string[];
  targetRoles: string[];
  level: ExperienceLevel;
  remoteOnly: boolean;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  skills: string[];
  level?: ExperienceLevel;
  description: string;
  url: string;
  source?: string;
  salary?: string;
  publishedAt?: string;
  category?: string;
  jobType?: string;
}

export interface JobMatchExplanation {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  roleMatch: boolean;
  levelMatch: boolean | null;
  excludedReason?: string;
}

const normalize = (value: string) =>
  value.normalize("NFKC").toLowerCase().trim().replace(/\\s+/g, " ");

export function explainJobMatch(candidate: CandidateProfile, job: Job): JobMatchExplanation {
  const candidateSkills = new Set(candidate.skills.map(normalize).filter(Boolean));
  const uniqueRequiredSkills = new Map<string, string>();

  for (const skill of job.skills) {
    const key = normalize(skill);
    if (key && !uniqueRequiredSkills.has(key)) uniqueRequiredSkills.set(key, skill.trim());
  }

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const [key, displayName] of uniqueRequiredSkills) {
    (candidateSkills.has(key) ? matchedSkills : missingSkills).push(displayName);
  }

  const title = normalize(job.title);
  const roleMatch = candidate.targetRoles.some((role) => {
    const target = normalize(role);
    return target.length > 0 && title.length > 0 && (title.includes(target) || target.includes(title));
  });
  const levelMatch = job.level ? candidate.level === job.level : null;

  if (candidate.remoteOnly && !job.remote) {
    return {
      score: 0,
      matchedSkills,
      missingSkills,
      roleMatch,
      levelMatch,
      excludedReason: "Excluded because the candidate selected remote-only roles."
    };
  }

  const skillScore = uniqueRequiredSkills.size > 0 ? matchedSkills.length / uniqueRequiredSkills.size : 0;
  const levelScore = levelMatch === null ? 10 : levelMatch ? 15 : 7.5;
  const score = Math.max(
    0,
    Math.min(100, Math.round(skillScore * 60 + (roleMatch ? 25 : 0) + levelScore))
  );

  return { score, matchedSkills, missingSkills, roleMatch, levelMatch };
}

export function scoreJob(candidate: CandidateProfile, job: Job): number {
  return explainJobMatch(candidate, job).score;
}
