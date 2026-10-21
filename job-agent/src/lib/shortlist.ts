import type { Job } from "./scoring";

const MAX_SAVED_JOBS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isShortlistJob(value: unknown): value is Job {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" || value.id.length === 0 || value.id.length > 180
    || typeof value.title !== "string" || value.title.length === 0 || value.title.length > 180
    || typeof value.company !== "string" || value.company.length === 0 || value.company.length > 140
    || typeof value.location !== "string" || value.location.length > 160
    || typeof value.remote !== "boolean"
    || !Array.isArray(value.skills) || value.skills.length > 50
    || !value.skills.every(skill => typeof skill === "string" && skill.length <= 80)
    || typeof value.description !== "string" || value.description.length > 5000
    || typeof value.url !== "string" || value.url.length > 2048
  ) return false;

  if (value.level !== undefined && value.level !== "entry" && value.level !== "mid" && value.level !== "senior") return false;
  for (const key of ["source", "salary", "publishedAt", "category", "jobType"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].length > 500)) return false;
  }

  try {
    return new URL(value.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Parse browser-local shortlist data defensively; invalid or old entries are discarded. */
export function readShortlist(raw: string | null): Job[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const unique = new Map<string, Job>();
    for (const item of value) {
      if (isShortlistJob(item)) unique.set(item.id, item);
    }
    return Array.from(unique.values()).slice(-MAX_SAVED_JOBS);
  } catch {
    return [];
  }
}

/** Add a job or remove it if it is already saved. The newest 100 entries are retained. */
export function toggleShortlist(shortlist: Job[], job: Job): Job[] {
  if (shortlist.some(item => item.id === job.id)) {
    return shortlist.filter(item => item.id !== job.id);
  }
  return [...shortlist.filter(item => item.id !== job.id), job].slice(-MAX_SAVED_JOBS);
}
