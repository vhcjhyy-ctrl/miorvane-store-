import { createHash, timingSafeEqual } from "node:crypto";
import type { Job } from "./scoring";

export interface CatalogJobRow {
  source_id: string;
  external_id: string;
  canonical_url: string;
  company_name: string;
  title: string;
  location_text: string;
  is_remote: boolean;
  description: string;
  skills: string[];
  experience_level: "entry" | "mid" | "senior" | null;
  published_at: string | null;
  last_seen_at: string;
  active: boolean;
}

/** Compare cron credentials using fixed-length digests, avoiding an early length/content timing branch. */
export function isJobSyncAuthorized(authorization: string | null, expectedSecret: string | undefined): boolean {
  if (!expectedSecret || expectedSecret.trim().length < 32 || !authorization || authorization.length > 1024) return false;
  if (!authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice(7);
  if (!supplied || supplied.length > 512) return false;

  const expectedHash = createHash("sha256").update(expectedSecret.trim(), "utf8").digest();
  const suppliedHash = createHash("sha256").update(supplied, "utf8").digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

function externalIdForJob(job: Job): string | null {
  const prefix = job.source === "Remotive" ? "remotive-" : job.source === "Arbeitnow" ? "arbeitnow-" : "";
  if (!prefix || !job.id.startsWith(prefix)) return null;
  const id = job.id.slice(prefix.length).trim();
  if (!id || id.length > 180) return null;
  return id;
}

/** Convert the normalized provider record into the catalog schema; reject bad URLs and incomplete keys. */
export function toCatalogJobRow(job: Job, sourceId: string, nowIso: string): CatalogJobRow | null {
  if (!sourceId || !Number.isFinite(Date.parse(nowIso))) return null;
  const externalId = externalIdForJob(job);
  if (!externalId || !job.title.trim() || !job.company.trim()) return null;

  try {
    const url = new URL(job.url);
    if (url.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return {
    source_id: sourceId,
    external_id: externalId,
    canonical_url: job.url,
    company_name: job.company.slice(0, 140),
    title: job.title.slice(0, 180),
    location_text: job.location.slice(0, 160),
    is_remote: job.remote,
    description: job.description.slice(0, 420),
    skills: [...new Set(job.skills.map(skill => skill.trim()).filter(Boolean))].slice(0, 50),
    experience_level: job.level ?? null,
    published_at: job.publishedAt && Number.isFinite(Date.parse(job.publishedAt))
      ? new Date(job.publishedAt).toISOString()
      : null,
    last_seen_at: new Date(nowIso).toISOString(),
    active: true
  };
}

/** Deduplicate provider results by stable external IDs, preserving their original order. */
export function dedupeJobsBySource(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const output: Job[] = [];
  for (const job of jobs) {
    const key = job.source + "|" + job.id;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(job);
  }
  return output;
}
