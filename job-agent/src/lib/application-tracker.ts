import type { Job } from "./scoring";

export type ApplicationStatus =
  | "interested"
  | "preparing"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface TrackedApplication {
  job: Job;
  status: ApplicationStatus;
  updatedAt: string;
  notes?: string;
  followUpDate?: string;
}

export type ApplicationDetailField = "notes" | "followUpDate";

const MAX_TRACKED_APPLICATIONS = 100;
const allowedStatuses = new Set<ApplicationStatus>([
  "interested", "preparing", "applied", "interview", "offer", "rejected", "withdrawn"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidJob(value: unknown): value is Job {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" || value.id.length === 0 || value.id.length > 180
    || typeof value.title !== "string" || value.title.length === 0 || value.title.length > 180
    || typeof value.company !== "string" || value.company.length === 0 || value.company.length > 140
    || typeof value.location !== "string" || value.location.length > 160
    || typeof value.remote !== "boolean"
    || !Array.isArray(value.skills) || value.skills.length > 50
    || !value.skills.every(skill => typeof skill === "string" && skill.length <= 80)
    || typeof value.description !== "string" || value.description.length > 5000
    || typeof value.url !== "string" || value.url.length > 2048
  ) return false;

  if (value.level !== undefined && value.level !== "entry" && value.level !== "mid" && value.level !== "senior") return false;
  for (const key of ["source", "salary", "publishedAt", "category", "jobType"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].length > 500)) return false;
  }

  try {
    return new URL(value.url).protocol === "https:";
  } catch {
    return false;
  }
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && allowedStatuses.has(value as ApplicationStatus);
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}


/** Parse browser-local tracking data defensively. Corrupt or stale records are skipped. */
export function readApplicationTracker(raw: string | null): TrackedApplication[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, TrackedApplication>();
    for (const item of parsed) {
      if (
        !isRecord(item)
        || !isValidJob(item.job)
        || !isApplicationStatus(item.status)
        || typeof item.updatedAt !== "string"
        || !Number.isFinite(Date.parse(item.updatedAt))
        || (item.notes !== undefined && (typeof item.notes !== "string" || item.notes.length > 2000))
        || (item.followUpDate !== undefined && !isDateOnly(item.followUpDate))
      ) continue;
      unique.set(item.job.id, {
        job: item.job,
        status: item.status,
        updatedAt: new Date(item.updatedAt).toISOString(),
        ...(typeof item.notes === "string" ? { notes: item.notes } : {}),
        ...(typeof item.followUpDate === "string" ? { followUpDate: item.followUpDate } : {})
      });
    }
    return Array.from(unique.values()).slice(-MAX_TRACKED_APPLICATIONS);
  } catch {
    return [];
  }
}

/** Set or clear one job's status without allowing duplicate records. */
export function updateApplicationTracker(
  applications: TrackedApplication[],
  job: Job,
  status: ApplicationStatus | "",
  updatedAt = new Date().toISOString()
): TrackedApplication[] {
  const previous = applications.find(item => item.job.id === job.id);
  const remaining = applications.filter(item => item.job.id !== job.id);
  if (status === "") return remaining;
  const next: TrackedApplication = {
    job,
    status,
    updatedAt: new Date(updatedAt).toISOString(),
    ...(previous?.notes !== undefined ? { notes: previous.notes } : {}),
    ...(previous?.followUpDate !== undefined ? { followUpDate: previous.followUpDate } : {})
  };
  return [...remaining, next].slice(-MAX_TRACKED_APPLICATIONS);
}

/** Update a tracked role's notes or date-only follow-up field without changing its status. */
export function updateTrackedApplicationDetails(
  applications: TrackedApplication[],
  job: Job,
  field: ApplicationDetailField,
  value: string,
  updatedAt = new Date().toISOString()
): TrackedApplication[] {
  const previous = applications.find(item => item.job.id === job.id);
  if (!previous) return applications;

  const updated: TrackedApplication = {
    ...previous,
    job,
    updatedAt: new Date(updatedAt).toISOString()
  };
  if (field === "notes") {
    updated.notes = value.replace(/\\u0000/g, "").slice(0, 2000);
  } else if (value === "") {
    delete updated.followUpDate;
  } else if (isDateOnly(value)) {
    updated.followUpDate = value;
  } else {
    return applications;
  }
  return applications.map(item => item.job.id === job.id ? updated : item);
}
