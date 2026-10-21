import type { Job, JobMatchExplanation } from "./scoring";

export type JobSortMode = "match" | "newest" | "company";
export type JobAgeFilter = "any" | "7" | "30";

export interface JobResultFilters {
  category: string;
  jobType: string;
  postedWithin: JobAgeFilter;
  salaryOnly: boolean;
  sortBy: JobSortMode;
}

export interface ScoredJob {
  job: Job;
  explanation: JobMatchExplanation;
}

function normalize(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

function postedAtMs(job: Job): number | null {
  if (!job.publishedAt) return null;
  const parsed = Date.parse(job.publishedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Apply explicit UI filters without mutating data, then sort deterministically. */
export function filterAndSortMatches(
  matches: ScoredJob[],
  filters: JobResultFilters,
  nowMs = Date.now()
): ScoredJob[] {
  const filtered = matches.filter(({ job }) => {
    if (filters.category !== "all" && normalize(job.category) !== normalize(filters.category)) return false;
    if (filters.jobType !== "all" && normalize(job.jobType) !== normalize(filters.jobType)) return false;
    if (filters.salaryOnly && !(job.salary && job.salary.trim())) return false;

    if (filters.postedWithin !== "any") {
      const publishedAt = postedAtMs(job);
      if (publishedAt === null || publishedAt > nowMs) return false;
      const days = Number(filters.postedWithin);
      if (nowMs - publishedAt > days * 24 * 60 * 60 * 1000) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (filters.sortBy === "company") {
      return a.job.company.localeCompare(b.job.company, undefined, { sensitivity: "base" })
        || b.explanation.score - a.explanation.score;
    }

    if (filters.sortBy === "newest") {
      const aDate = postedAtMs(a.job);
      const bDate = postedAtMs(b.job);
      if (aDate === null && bDate !== null) return 1;
      if (aDate !== null && bDate === null) return -1;
      if (aDate !== null && bDate !== null && aDate !== bDate) return bDate - aDate;
      return b.explanation.score - a.explanation.score;
    }

    return b.explanation.score - a.explanation.score;
  });
}
