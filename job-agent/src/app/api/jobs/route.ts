import { NextResponse } from "next/server";
import type { ExperienceLevel, Job } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs?limit=100";
const UPSTREAM_CACHE_SECONDS = 6 * 60 * 60;

type UnknownRecord = Record<string, unknown>;

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

const knownSkills = [
  "TypeScript", "JavaScript", "Node.js", "Next.js", "Python", "React", "SQL",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes", "AWS",
  "Azure", "GCP", "Linux", "Git", "CI/CD", "REST API", "GraphQL", "HTML",
  "CSS", "Machine Learning", "TensorFlow", "PyTorch", "Data Analysis",
  "Power BI", "Excel", "Cybersecurity", "Networking", "Terraform", "Ansible",
  "Java", "C++", "C#", "Rust", "PHP", "Ruby", "Django", "Flask", "FastAPI",
  "Vue", "Angular", "Svelte", "Spring Boot", "Jenkins", "Bash", "Selenium",
  "Playwright", "Cypress", "Salesforce", "Kotlin", "Swift"
];

function extractKnownSkills(sourceText: string): string[] {
  const found: string[] = [];
  for (const skill of knownSkills) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("(^|[^a-z0-9])" + escaped + "(?=$|[^a-z0-9])", "i");
    if (pattern.test(sourceText)) found.push(skill);
  }
  return found;
}

function inferLevel(title: string): ExperienceLevel | undefined {
  const lower = title.toLowerCase();
  if (/\b(intern|internship|junior|jr\.?|entry[- ]level|graduate)\b/.test(lower)) return "entry";
  if (/\b(senior|sr\.?|lead|principal|staff|head of)\b/.test(lower)) return "senior";
  return undefined;
}

function safeRemotiveUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== "https://remotive.com" || !url.pathname.startsWith("/remote-jobs/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseJob(value: unknown): Job | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "number" || typeof value.id === "string" ? String(value.id) : "";
  const title = textField(value.title, 180);
  const company = textField(value.company_name, 140);
  const url = safeRemotiveUrl(value.url);
  if (!id || !title || !company || !url) return null;

  const fullDescription = textField(value.description, 4000);
  const category = textField(value.category, 100);
  const searchableText = [title, category, fullDescription].join(" ");
  const candidateLocation = textField(value.candidate_required_location, 140);
  const salary = textField(value.salary, 100);
  const publishedAtRaw = typeof value.publication_date === "string" ? value.publication_date : "";
  const parsedDate = publishedAtRaw ? new Date(publishedAtRaw) : null;
  const publishedAt = parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : undefined;
  const jobType = textField(value.job_type, 80);

  return {
    id: "remotive-" + id,
    title,
    company,
    location: candidateLocation || "Remote; eligibility may be restricted",
    remote: true,
    skills: extractKnownSkills(searchableText),
    level: inferLevel(title),
    description: fullDescription.slice(0, 420) || "Open the original listing for the full job description.",
    url,
    source: "Remotive",
    salary: salary || undefined,
    publishedAt,
    category: category || undefined,
    jobType: jobType || undefined
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = (requestUrl.searchParams.get("q") ?? "").trim().slice(0, 80).toLowerCase();
  const rawLimit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "25", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 25;

  try {
    const response = await fetch(REMOTIVE_API_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: UPSTREAM_CACHE_SECONDS },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "The Remotive job feed is temporarily unavailable. Please try again later." },
        { status: 502 }
      );
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
      return NextResponse.json(
        { error: "The job source returned an unexpected response." },
        { status: 502 }
      );
    }

    const jobs = payload.jobs
      .map(parseJob)
      .filter((job): job is Job => job !== null)
      .filter((job) => {
        if (!query) return true;
        const searchable = (job.title + " " + job.company + " " + job.description + " " + (job.category ?? ""))
          .toLowerCase();
        return query.split(/\\s+/).filter(Boolean).every((token) => searchable.includes(token));
      })
      .slice(0, limit);

    return NextResponse.json({
      jobs,
      total: jobs.length,
      query,
      source: "Remotive",
      sourceUrl: "https://remotive.com/remote-jobs/api",
      cacheHours: UPSTREAM_CACHE_SECONDS / 3600
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the public job feed. Please check your connection and retry later." },
      { status: 502 }
    );
  }
}
