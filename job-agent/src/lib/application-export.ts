import type { TrackedApplication } from "./application-tracker";

const HEADERS = [
  "job_title",
  "company",
  "status",
  "last_updated",
  "location",
  "salary",
  "published_at",
  "source",
  "job_url"
] as const;

function csvCell(value: unknown): string {
  let text = typeof value === "string" ? value : value == null ? "" : String(value);
  text = text.replace(/\u0000/g, "");
  // Prefix values that spreadsheet software might interpret as formulas.
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

/** Serialize a browser-local application tracker as spreadsheet-safe UTF-8 CSV text. */
export function applicationTrackerToCsv(applications: TrackedApplication[]): string {
  const rows = applications.map(({ job, status, updatedAt }) => [
    job.title,
    job.company,
    status,
    updatedAt,
    job.location,
    job.salary ?? "",
    job.publishedAt ?? "",
    job.source ?? "",
    job.url
  ]);
  return [HEADERS, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
