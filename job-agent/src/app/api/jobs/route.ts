import { NextResponse } from "next/server";
import { filterRemotiveJobs } from "@/lib/remotive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs?limit=100";
const UPSTREAM_CACHE_SECONDS = 6 * 60 * 60;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = (requestUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const rawLimit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "25", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 25;

  try {
    const response = await fetch(REMOTIVE_API_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: UPSTREAM_CACHE_SECONDS },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return errorResponse("The Remotive job feed is temporarily unavailable. Please try again later.", 502);
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("jobs" in payload) || !Array.isArray(payload.jobs)) {
      return errorResponse("The job source returned an unexpected response.", 502);
    }

    const jobs = filterRemotiveJobs(payload.jobs, query, limit);
    return NextResponse.json({
      jobs,
      total: jobs.length,
      query,
      source: "Remotive",
      sourceUrl: "https://remotive.com/remote-jobs/api",
      cacheHours: UPSTREAM_CACHE_SECONDS / 3600
    });
  } catch {
    return errorResponse("Could not reach the public job feed. Please check your connection and retry later.", 502);
  }
}
