import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import type { Job } from "../../../../lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CatalogSource = "all" | "remotive" | "arbeitnow";
type UnknownRecord = Record<string, unknown>;

const REMOTIVE_HOSTS = new Set(["remotive.com", "www.remotive.com"]);
const ARBEITNOW_HOSTS = new Set([
  "arbeitnow.com", "www.arbeitnow.com",
  "arbeitnow.co.uk", "www.arbeitnow.co.uk",
  "arbeitnow.fr", "www.arbeitnow.fr",
  "arbeitnow.ch", "www.arbeitnow.ch",
  "arbeitnow.nl", "www.arbeitnow.nl"
]);
const SELECT_COLUMNS = "id,external_id,canonical_url,company_name,title,location_text,is_remote,description,skills,experience_level,published_at,salary_text,category,job_type,job_sources!inner(source_key,display_name)";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" }
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maxLength) : "";
}

function normalizePublishedAt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function safeJobUrl(value: unknown, sourceKey: CatalogSource): string | null {
  if (typeof value !== "string" || sourceKey === "all") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    if (sourceKey === "remotive") {
      return REMOTIVE_HOSTS.has(url.hostname.toLowerCase()) && url.pathname.startsWith("/remote-jobs/")
        ? url.toString()
        : null;
    }
    return ARBEITNOW_HOSTS.has(url.hostname.toLowerCase())
      && (url.pathname.startsWith("/view/") || url.pathname.startsWith("/jobs/"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Revalidate catalog rows before sending them to the browser, even though ingest already validated them. */
function normalizeCatalogRow(value: unknown): Job | null {
  if (!isRecord(value)) return null;
  const relation = Array.isArray(value.job_sources) ? value.job_sources[0] : value.job_sources;
  if (!isRecord(relation)) return null;

  const sourceKey = relation.source_key;
  const sourceName = cleanString(relation.display_name, 80);
  if ((sourceKey !== "remotive" && sourceKey !== "arbeitnow") || !sourceName) return null;

  const id = cleanString(value.external_id, 180);
  const title = cleanString(value.title, 180);
  const company = cleanString(value.company_name, 140);
  const location = cleanString(value.location_text, 160);
  const description = cleanString(value.description, 420);
  const url = safeJobUrl(value.canonical_url, sourceKey);
  if (!id || !title || !company || !url || typeof value.is_remote !== "boolean") return null;

  const skills = Array.isArray(value.skills)
    ? value.skills
        .filter((skill): skill is string => typeof skill === "string")
        .map(skill => cleanString(skill, 80))
        .filter(Boolean)
        .slice(0, 50)
    : [];
  const rawLevel = value.experience_level;
  const level = rawLevel === "entry" || rawLevel === "mid" || rawLevel === "senior" ? rawLevel : undefined;
  const publishedAt = normalizePublishedAt(value.published_at);

  return {
    id: sourceKey + "-" + id,
    title,
    company,
    location: location || "Location not specified",
    remote: value.is_remote,
    skills,
    level,
    description: description || "Open the original listing for the full job description.",
    url,
    source: sourceName,
    ...(cleanString(value.salary_text, 100) ? { salary: cleanString(value.salary_text, 100) } : {}),
    ...(cleanString(value.category, 100) ? { category: cleanString(value.category, 100) } : {}),
    ...(cleanString(value.job_type, 80) ? { jobType: cleanString(value.job_type, 80) } : {}),
    ...(publishedAt ? { publishedAt } : {})
  };
}

function normalizeSource(value: string | null): CatalogSource | null {
  if (value === null || value === "" || value === "all") return "all";
  return value === "remotive" || value === "arbeitnow" ? value : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = cleanString(url.searchParams.get("q"), 80);
  const source = normalizeSource(url.searchParams.get("source"));
  if (!source) return json({ error: "Choose a supported catalog source." }, 400);

  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "40", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 40;
  const parsedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.min(1000, Math.max(1, parsedPage)) : 1;
  const offset = (page - 1) * limit;

  let client;
  try {
    client = await createServerSupabaseClient();
  } catch {
    return json({ error: "Could not initialize the Supabase catalog client." }, 503);
  }
  if (!client) {
    return json({
      error: "The catalog is not configured. Set the Supabase project URL and publishable key, then apply migrations 0001 and 0003."
    }, 503);
  }

  try {
    const expiryCutoff = new Date().toISOString();
    let queryBuilder = client
      .from("jobs")
      .select(SELECT_COLUMNS, { count: "estimated" })
      .eq("active", true)
      .or("expires_at.is.null,expires_at.gt." + expiryCutoff)
      .eq("job_sources.enabled", true);

    if (query) {
      queryBuilder = queryBuilder.textSearch("search_vector", query, {
        type: "plain",
        config: "simple"
      });
    }
    if (source !== "all") queryBuilder = queryBuilder.eq("job_sources.source_key", source);

    const { data, error, count } = await queryBuilder
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") {
        return json({
          error: "The public job catalog is not installed yet. Apply migration 0003_public_job_catalog.sql after migration 0001."
        }, 503);
      }
      return json({ error: "Could not query the public job catalog. Check the migration and read-only RLS policies." }, 503);
    }

    const jobs = Array.isArray(data)
      ? data.map(normalizeCatalogRow).filter((job): job is Job => job !== null)
      : [];
    return json({
      jobs,
      total: typeof count === "number" ? count : jobs.length,
      query,
      requestedSource: source,
      source: "Supabase catalog",
      page,
      pageSize: limit,
      sources: Array.from(new Set(jobs.map(job => job.source))),
      warnings: [],
      sourceLinks: {
        Remotive: "https://remotive.com/remote-jobs/api",
        Arbeitnow: "https://www.arbeitnow.com"
      }
    });
  } catch {
    return json({ error: "Could not query the public job catalog. Please retry." }, 503);
  }
}
