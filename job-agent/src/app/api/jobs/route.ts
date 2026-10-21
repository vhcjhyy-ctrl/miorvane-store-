import { NextResponse } from "next/server";
import type { Job } from "@/lib/scoring";
import { filterArbeitnowJobs } from "@/lib/arbeitnow";
import { filterRemotiveJobs } from "@/lib/remotive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs?limit=100";
const ARBEITNOW_API_URL = "https://www.arbeitnow.com/api/job-board-api";
const REMOTIVE_CACHE_SECONDS = 6 * 60 * 60;
const ARBEITNOW_CACHE_SECONDS = 60 * 60;

type JobSource = "remotive" | "arbeitnow" | "all";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function fetchRemotiveJobs(query: string, perSourceLimit: number): Promise<Job[]> {
  const response = await fetch(REMOTIVE_API_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: REMOTIVE_CACHE_SECONDS },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Remotive is temporarily unavailable.");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("jobs" in payload) || !Array.isArray(payload.jobs)) {
    throw new Error("Remotive returned an unexpected response.");
  }
  return filterRemotiveJobs(payload.jobs, query, perSourceLimit);
}

async function fetchArbeitnowJobs(query: string, perSourceLimit: number): Promise<Job[]> {
  const response = await fetch(ARBEITNOW_API_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: ARBEITNOW_CACHE_SECONDS },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Arbeitnow is temporarily unavailable.");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) {
    throw new Error("Arbeitnow returned an unexpected response.");
  }
  return filterArbeitnowJobs(payload.data, query, perSourceLimit);
}

function interleaveJobs(remotive: Job[], arbeitnow: Job[], limit: number): Job[] {
  const merged: Job[] = [];
  const maxLength = Math.max(remotive.length, arbeitnow.length);
  for (let index = 0; index < maxLength && merged.length < limit; index += 1) {
    if (remotive[index]) merged.push(remotive[index]);
    if (arbeitnow[index] && merged.length < limit) merged.push(arbeitnow[index]);
  }

  const seen = new Set<string>();
  return merged.filter(job => {
    const key = [job.title, job.company, job.location]
      .map(value => value.normalize("NFKC").trim().toLowerCase())
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = (requestUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const rawLimit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "25", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 25;
  const requestedSource = requestUrl.searchParams.get("source") ?? "all";
  if (requestedSource !== "all" && requestedSource !== "remotive" && requestedSource !== "arbeitnow") {
    return errorResponse("Choose a supported job source.", 400);
  }
  const source = requestedSource as JobSource;

  const attempts = await Promise.all([
    source !== "arbeitnow"
      ? fetchRemotiveJobs(query, 50).then(jobs => ({ source: "Remotive", jobs, error: "" }))
          .catch(() => ({ source: "Remotive", jobs: [] as Job[], error: "Remotive is temporarily unavailable." }))
      : Promise.resolve({ source: "Remotive", jobs: [] as Job[], error: "" }),
    source !== "remotive"
      ? fetchArbeitnowJobs(query, 50).then(jobs => ({ source: "Arbeitnow", jobs, error: "" }))
          .catch(() => ({ source: "Arbeitnow", jobs: [] as Job[], error: "Arbeitnow is temporarily unavailable." }))
      : Promise.resolve({ source: "Arbeitnow", jobs: [] as Job[], error: "" })
  ]);

  const selected = attempts.filter(item =>
    source === "all" || item.source.toLowerCase() === source
  );
  const successful = selected.filter(item => !item.error);
  const warnings = selected.filter(item => item.error).map(item => item.error);
  if (successful.length === 0) {
    return NextResponse.json({
      error: "All selected job sources are unavailable. Please try again later.",
      warnings
    }, { status: 502 });
  }

  const remotive = successful.find(item => item.source === "Remotive")?.jobs ?? [];
  const arbeitnow = successful.find(item => item.source === "Arbeitnow")?.jobs ?? [];
  const jobs = source === "all"
    ? interleaveJobs(remotive, arbeitnow, limit)
    : (source === "remotive" ? remotive : arbeitnow).slice(0, limit);

  return NextResponse.json({
    jobs,
    total: jobs.length,
    query,
    requestedSource: source,
    sources: successful.filter(item => item.jobs.length > 0).map(item => item.source),
    warnings,
    sourceLinks: {
      Remotive: "https://remotive.com/remote-jobs/api",
      Arbeitnow: "https://www.arbeitnow.com"
    },
    cacheHours: {
      Remotive: REMOTIVE_CACHE_SECONDS / 3600,
      Arbeitnow: ARBEITNOW_CACHE_SECONDS / 3600
    }
  });
}
