import type { ExperienceLevel, Job } from "@/lib/scoring";

type UnknownRecord = Record<string, unknown>;

interface ParsedRemotiveJob {
  job: Job;
  searchableText: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\\s+/g, " ")
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
    const escaped = skill.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
    const pattern = new RegExp("(^|[^a-z0-9])" + escaped + "(?=$|[^a-z0-9])", "i");
    if (pattern.test(sourceText)) found.push(skill);
  }
  return found;
}

function inferLevel(title: string): ExperienceLevel | undefined {
  const lower = title.toLowerCase();
  if (/\\b(intern|internship|junior|jr\\.?|entry[- ]level|graduate)\\b/.test(lower)) return "entry";
  if (/\\b(senior|sr\\.?|lead|principal|staff|head of)\\b/.test(lower)) return "senior";
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

function parseRemotiveJob(value: unknown): ParsedRemotiveJob | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "number" || typeof value.id === "string" ? String(value.id) : "";
  const title = textField(value.title, 180);
  const company = textField(value.company_name, 140);
  const url = safeRemotiveUrl(value.url);
  if (!id || !title || !company || !url) return null;

  const fullDescription = textField(value.description, 4000);
  const category = textField(value.category, 100);
  const candidateLocation = textField(value.candidate_required_location, 140);
  const salary = textField(value.salary, 100);
  const publishedAtRaw = typeof value.publication_date === "string" ? value.publication_date : "";
  const parsedDate = publishedAtRaw ? new Date(publishedAtRaw) : null;
  const publishedAt = parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : undefined;
  const jobType = textField(value.job_type, 80);

  const searchableText = [title, company, category, candidateLocation, fullDescription].join(" ").toLowerCase();
  const job: Job = {
    id: "remotive-" + id,
    title,
    company,
    location: candidateLocation || "Remote; eligibility may be restricted",
    remote: true,
    skills: extractKnownSkills([title, category, fullDescription].join(" ")),
    level: inferLevel(title),
    description: fullDescription.slice(0, 420) || "Open the original listing for the full job description.",
    url,
    source: "Remotive",
    salary: salary || undefined,
    publishedAt,
    category: category || undefined,
    jobType: jobType || undefined
  };
  return { job, searchableText };
}

/** Map untrusted public feed data to safe, normalized listings and apply a local keyword filter. */
export function filterRemotiveJobs(records: unknown[], query: string, requestedLimit: number): Job[] {
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.floor(requestedLimit))) : 25;
  const terms = query.trim().slice(0, 80).toLowerCase().split(/\\s+/).filter(Boolean);

  return records
    .map(parseRemotiveJob)
    .filter((item): item is ParsedRemotiveJob => item !== null)
    .filter((item) => terms.every((term) => item.searchableText.includes(term)))
    .slice(0, limit)
    .map((item) => item.job);
}
