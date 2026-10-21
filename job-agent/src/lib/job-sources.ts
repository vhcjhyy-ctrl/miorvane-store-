import type { Job } from "./scoring";

/** Merge provider feeds in alternating order, suppress duplicates, and fill the requested limit when possible. */
export function mergeJobSources(remotive: Job[], arbeitnow: Job[], requestedLimit: number): Job[] {
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 40;
  const merged: Job[] = [];
  const seen = new Set<string>();
  let remotiveIndex = 0;
  let arbeitnowIndex = 0;
  let nextProvider: "remotive" | "arbeitnow" = "remotive";

  const keyFor = (job: Job) => [job.title, job.company, job.location]
    .map(value => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase())
    .join("|");

  while (merged.length < limit && (remotiveIndex < remotive.length || arbeitnowIndex < arbeitnow.length)) {
    let candidate: Job | undefined;

    if (nextProvider === "remotive" && remotiveIndex < remotive.length) {
      candidate = remotive[remotiveIndex];
      remotiveIndex += 1;
    } else if (nextProvider === "arbeitnow" && arbeitnowIndex < arbeitnow.length) {
      candidate = arbeitnow[arbeitnowIndex];
      arbeitnowIndex += 1;
    } else if (remotiveIndex < remotive.length) {
      candidate = remotive[remotiveIndex];
      remotiveIndex += 1;
    } else if (arbeitnowIndex < arbeitnow.length) {
      candidate = arbeitnow[arbeitnowIndex];
      arbeitnowIndex += 1;
    }

    nextProvider = nextProvider === "remotive" ? "arbeitnow" : "remotive";
    if (!candidate) continue;

    const key = keyFor(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }

  return merged;
}
