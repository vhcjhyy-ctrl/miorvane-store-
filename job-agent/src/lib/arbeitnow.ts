import type { ExperienceLevel, Job } from "@/lib/scoring";
import { extractKnownSkills } from "@/lib/remotive";

type UnknownRecord = Record<string, unknown>;

interface ParsedArbeitnowJob {
  job: Job;
  searchableText: string;
}

const allowedHosts = new Set([
  "arbeitnow.com", "www.arbeitnow.com",
  "arbeitnow.co.uk", "www.arbeitnow.co.uk",
  "arbeitnow.fr", "www.arbeitnow.fr",
  "arbeitnow.ch", "www.arbeitnow.ch",
  "arbeitnow.nl", "www.arbeitnow.nl"
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function textField(value: unknown, maxLength = 250): string {
  return plainText(value).slice(0, maxLength);
}

function readStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value.slice(0, maxItems)) {
    const cleaned = textField(item, maxLength);
    if (cleaned && !result.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) {
      result.push(cleaned);
    }
  }
  return result;
}

function safeArbeitnowUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) return null;
    if (!url.pathname.startsWith("/view/") && !url.pathname.startsWith("/jobs/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function inferLevel(title: string): ExperienceLevel | undefined {
  const lower = title.toLowerCase();
  if (/\b(intern|internship|junior|jr\.?|entry[- ]level|graduate|werkstudent)\b/.test(lower)) return "entry";
  if (/\b(senior|sr\.?|lead|principal|staff|head of)\b/.test(lower)) return "senior";
  return undefined;
}

function parseArbeitnowJob(value: unknown): ParsedArbeitnowJob | null {
  if (!isRecord(value)) return null;
  const slug = textField(value.slug, 180);
  const title = textField(value.title, 180);
  const company = textField(value.company_name, 140);
  const url = safeArbeitnowUrl(value.url);
  if (!slug || !title || !company || !url) return null;

  const description = textField(value.description, 4000);
  const location = textField(value.location, 160) || "Location not specified";
  const tags = readStringList(value.tags, 30, 80);
  const jobTypes = readStringList(value.job_types, 10, 80);
  const remote = typeof value.remote === "boolean"
    ? value.remote
    : tags.some(tag => tag.toLowerCase() === "remote");
  const createdAt = typeof value.created_at === "number" || typeof value.created_at === "string"
    ? Number(value.created_at)
    : NaN;
  const dateMs = Number.isFinite(createdAt) && createdAt > 0 ? createdAt * 1000 : NaN;
  const publishedAt = Number.isFinite(dateMs) && Number.isFinite(new Date(dateMs).getTime())
    ? new Date(dateMs).toISOString()
    : undefined;
  const salary = textField(value.salary, 100);
  const searchableText = [title, company, location, description, ...tags, ...jobTypes].join(" ").toLowerCase();

  const job: Job = {
    id: "arbeitnow-" + slug,
    title,
    company,
    location,
    remote,
    skills: extractKnownSkills([title, description, ...tags].join(" ")),
    level: inferLevel(title),
    description: description.slice(0, 420) || "Open the original listing for the full job description.",
    url,
    source: "Arbeitnow",
    ...(salary ? { salary } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(tags[0] ? { category: tags[0] } : {}),
    ...(jobTypes[0] ? { jobType: jobTypes[0] } : {})
  };
  return { job, searchableText };
}

/** Normalize the public Arbeitnow feed; always link back to the provider's own listing. */
export function filterArbeitnowJobs(records: unknown[], query: string, requestedLimit: number): Job[] {
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.floor(requestedLimit))) : 25;
  const terms = query.trim().slice(0, 80).toLowerCase().split(/\s+/).filter(Boolean);

  return records
    .map(parseArbeitnowJob)
    .filter((item): item is ParsedArbeitnowJob => item !== null)
    .filter(item => terms.every(term => item.searchableText.includes(term)))
    .slice(0, limit)
    .map(item => item.job);
}
