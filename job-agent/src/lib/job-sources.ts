import type { Job } from "./scoring";

/** Merge provider feeds in alternating order, suppress obvious duplicates, then cap the final list. */
export function mergeJobSources(remotive: Job[], arbeitnow: Job[], requestedLimit: number): Job[] {
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 40;
  const interleaved: Job[] = [];
  const maxLength = Math.max(remotive.length, arbeitnow.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (remotive[index]) interleaved.push(remotive[index]);
    if (arbeitnow[index]) interleaved.push(arbeitnow[index]);
  }

  const seen = new Set<string>();
  const deduplicated: Job[] = [];
  for (const job of interleaved) {
    const key = [job.title, job.company, job.location]
      .map(value => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase())
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(job);
    if (deduplicated.length >= limit) break;
  }

  return deduplicated;
}
