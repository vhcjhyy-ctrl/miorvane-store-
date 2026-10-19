export type ExperienceLevel = "entry" | "mid" | "senior";
export interface CandidateProfile { skills: string[]; targetRoles: string[]; level: ExperienceLevel; remoteOnly: boolean; }
export interface Job { id: string; title: string; company: string; location: string; remote: boolean; skills: string[]; level: ExperienceLevel; description: string; url: string; }
const normalize = (value: string) => value.toLocaleLowerCase().trim();
export function scoreJob(candidate: CandidateProfile, job: Job): number {
  if (candidate.remoteOnly && !job.remote) return 0;
  const candidateSkills = new Set(candidate.skills.map(normalize));
  const requiredSkills = job.skills.map(normalize);
  const skillScore = requiredSkills.length ? requiredSkills.filter((skill) => candidateSkills.has(skill)).length / requiredSkills.length : 0;
  const roleScore = candidate.targetRoles.some((role) => { const r = normalize(role); const t = normalize(job.title); return t.includes(r) || r.includes(t); }) ? 1 : 0;
  const levelScore = candidate.level === job.level ? 1 : 0.5;
  return Math.max(0, Math.min(100, Math.round(skillScore * 60 + roleScore * 25 + levelScore * 15)));
}
