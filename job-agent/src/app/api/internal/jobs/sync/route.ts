import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { filterArbeitnowJobs } from "../../../../../lib/arbeitnow";
import { filterRemotiveJobs } from "../../../../../lib/remotive";
import { dedupeJobsBySource, toCatalogJobRow } from "../../../../../lib/job-ingestion";
import type { Job } from "../../../../../lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs?limit=100";
const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";
const PROVIDERS = [
  { key: "remotive", name: "Remotive", endpoint: REMOTIVE_URL, cacheSeconds: 6 * 60 * 60 },
  { key: "arbeitnow", name: "Arbeitnow", endpoint: ARBEITNOW_URL, cacheSeconds: 60 * 60 }
] as const;

type ProviderKey = typeof PROVIDERS[number]["key"];
type ProviderResult = {
  key: ProviderKey;
  name: string;
  endpoint: string;
  jobs: Job[];
  error: string | null;
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" }
  });
}

function secretEquals(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

async function fetchProvider(provider: typeof PROVIDERS[number]): Promise<ProviderResult> {
  try {
    const response = await fetch(provider.endpoint, {
      headers: { Accept: "application/json", "User-Agent": "JobAgentCatalogSync/1.0" },
      next: { revalidate: provider.cacheSeconds },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error("Provider returned an unsuccessful status.");

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("Provider returned an unexpected response.");

    let jobs: Job[];
    if (provider.key === "remotive") {
      if (!("jobs" in payload) || !Array.isArray(payload.jobs)) throw new Error("Provider response schema was invalid.");
      jobs = filterRemotiveJobs(payload.jobs, "", 50);
    } else {
      if (!("data" in payload) || !Array.isArray(payload.data)) throw new Error("Provider response schema was invalid.");
      jobs = filterArbeitnowJobs(payload.data, "", 50);
    }

    return { ...provider, jobs: dedupeJobsBySource(jobs), error: null };
  } catch {
    return {
      ...provider,
      jobs: [],
      error: provider.key === "remotive"
        ? "Remotive could not be refreshed during this sync."
        : "Arbeitnow could not be refreshed during this sync."
    };
  }
}

export async function POST(request: Request) {
  const baseUrl = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const syncSecret = process.env.JOB_SYNC_CRON_SECRET?.trim();

  if (!baseUrl || !serviceRoleKey || !syncSecret || syncSecret.length < 32) {
    return json({
      error: "Job catalog sync is not configured. Set the server-side Supabase URL, service-role key, and a JOB_SYNC_CRON_SECRET of at least 32 characters."
    }, 503);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 1024) {
    return json({ error: "A valid job-sync bearer token is required." }, 401);
  }
  const provided = authorization.slice(7);
  if (!provided || provided.length > 512 || !secretEquals(provided, syncSecret)) {
    return json({ error: "A valid job-sync bearer token is required." }, 401);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    return json({ error: "The server-side Supabase URL is invalid." }, 503);
  }
  const localHttp = parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1");
  if (parsedUrl.protocol !== "https:" && !localHttp) {
    return json({ error: "The server-side Supabase URL must use HTTPS outside local development." }, 503);
  }

  const startedAt = Date.now();
  const supabase = createClient(baseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const results = await Promise.all(PROVIDERS.map(fetchProvider));
  const now = new Date().toISOString();

  const sourceRows = results.map(result => ({
    source_key: result.key,
    display_name: result.name,
    source_type: "api",
    enabled: true,
    config: { endpoint: result.endpoint },
    last_checked_at: now,
    last_error: result.error
  }));

  const { data: sourceData, error: sourceError } = await supabase
    .from("job_sources")
    .upsert(sourceRows, { onConflict: "source_key", defaultToNull: false })
    .select("id,source_key");

  if (sourceError || !Array.isArray(sourceData)) {
    return json({
      error: "Could not update job-source status. Check migration 0001 and the server-side Supabase service-role configuration."
    }, 503);
  }

  const sourceIds = new Map<string, string>();
  for (const source of sourceData) {
    if (source && typeof source.source_key === "string" && typeof source.id === "string") {
      sourceIds.set(source.source_key, source.id);
    }
  }

  const counts: Record<string, number> = { remotive: 0, arbeitnow: 0 };
  const warnings = results.filter(result => result.error).map(result => result.error as string);

  for (const result of results) {
    if (result.error || result.jobs.length === 0) continue;
    const sourceId = sourceIds.get(result.key);
    if (!sourceId) {
      warnings.push(result.name + " was refreshed but its source identifier was not returned.");
      continue;
    }

    const rows = result.jobs
      .map(job => toCatalogJobRow(job, sourceId, now))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) continue;
    const { error } = await supabase.from("jobs").upsert(rows, {
      onConflict: "source_id,external_id",
      defaultToNull: false
    });

    if (error) {
      await supabase.from("job_sources").update({
        last_error: "Catalog upsert failed during scheduled sync.",
        last_checked_at: now
      }).eq("source_key", result.key);
      warnings.push(result.name + " could not be saved to the catalog.");
      continue;
    }
    counts[result.key] = rows.length;
  }

  const succeededProviders = results.filter(result => result.error === null).length;
  const { error: auditError } = await supabase.from("audit_logs").insert({
    user_id: null,
    event_type: "job_sync.completed",
    entity_type: "job_catalog",
    entity_id: null,
    details: {
      sourceCount: PROVIDERS.length,
      succeededProviders,
      remotiveUpserted: counts.remotive,
      arbeitnowUpserted: counts.arbeitnow,
      warningCount: warnings.length,
      elapsedMs: Date.now() - startedAt
    }
  });

  if (succeededProviders === 0) {
    return json({
      error: "No job provider could be refreshed. Existing catalog rows were not deactivated.",
      upserted: counts,
      warnings
    }, 502);
  }

  return json({
    status: warnings.length ? "partial" : "ok",
    refreshedAt: now,
    providers: results.map(result => ({
      source: result.name,
      fetched: result.jobs.length,
      upserted: counts[result.key],
      warning: result.error
    })),
    totalUpserted: counts.remotive + counts.arbeitnow,
    warnings: auditError ? [...warnings, "The sync completed, but the audit event could not be saved."] : warnings,
    elapsedMs: Date.now() - startedAt
  }, warnings.length ? 207 : 200);
}
