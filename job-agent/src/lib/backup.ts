import { readApplicationTracker, type TrackedApplication } from "./application-tracker";
import { readShortlist } from "./shortlist";
import { readSavedJobSearches, type SavedJobSearch } from "./saved-searches";
import { JOB_AGENT_LOCAL_STORAGE_KEYS } from "./local-data";
import type { ExperienceLevel, Job } from "./scoring";

export interface JobAgentProfileBackup {
  schemaVersion: 3;
  candidateName: string;
  skillsText: string;
  rolesText: string;
  level: ExperienceLevel;
  remoteOnly: boolean;
  minimumScore: number;
  draftLanguage: "en" | "ar";
}

export interface JobAgentBackup {
  schemaVersion: 2;
  exportedAt: string;
  profile: JobAgentProfileBackup;
  savedJobs: Job[];
  applications: TrackedApplication[];
  savedSearches: SavedJobSearch[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProfile(value: unknown): JobAgentProfileBackup | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 3
    || typeof value.candidateName !== "string" || value.candidateName.length > 80
    || typeof value.skillsText !== "string" || value.skillsText.length > 3000
    || typeof value.rolesText !== "string" || value.rolesText.length > 3000
    || (value.level !== "entry" && value.level !== "mid" && value.level !== "senior")
    || typeof value.remoteOnly !== "boolean"
    || typeof value.minimumScore !== "number" || value.minimumScore < 30 || value.minimumScore > 95 || value.minimumScore % 5 !== 0
    || (value.draftLanguage !== "en" && value.draftLanguage !== "ar")
  ) return null;

  return {
    schemaVersion: 3,
    candidateName: value.candidateName,
    skillsText: value.skillsText,
    rolesText: value.rolesText,
    level: value.level as ExperienceLevel,
    remoteOnly: value.remoteOnly,
    minimumScore: value.minimumScore,
    draftLanguage: value.draftLanguage
  };
}

/** Create a versioned JSON backup; CV bytes and extracted text are intentionally excluded. */
export function createJobAgentBackup(
  profile: JobAgentProfileBackup,
  savedJobs: Job[],
  applications: TrackedApplication[],
  savedSearches: SavedJobSearch[] = [],
  exportedAt = new Date().toISOString()
): JobAgentBackup {
  return {
    schemaVersion: 2,
    exportedAt,
    profile: { ...profile },
    savedJobs: [...savedJobs],
    applications: [...applications],
    savedSearches: [...savedSearches]
  };
}

/**
 * Validate the entire backup before any storage mutation. If any record is unsafe,
 * malformed, duplicated, or outside the current app schema, reject the whole import.
 */
export function parseJobAgentBackup(value: unknown): JobAgentBackup | null {
  if (
    !isRecord(value)
    || (value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || typeof value.exportedAt !== "string"
    || !Number.isFinite(Date.parse(value.exportedAt))
    || !Array.isArray(value.savedJobs)
    || !Array.isArray(value.applications)
    || value.savedJobs.length > 100
    || value.applications.length > 100
    || (value.schemaVersion === 2 && (!Array.isArray(value.savedSearches) || value.savedSearches.length > 20))
  ) return null;

  const profile = parseProfile(value.profile);
  if (!profile) return null;

  const savedJobs = readShortlist(JSON.stringify(value.savedJobs));
  const applications = readApplicationTracker(JSON.stringify(value.applications));

  if (savedJobs.length !== value.savedJobs.length || applications.length !== value.applications.length) return null;

  const savedSearches = value.schemaVersion === 1
    ? []
    : readSavedJobSearches(JSON.stringify(value.savedSearches));
  if (value.schemaVersion === 2 && savedSearches.length !== (value.savedSearches as unknown[]).length) return null;

  return {
    schemaVersion: 2,
    exportedAt: new Date(value.exportedAt).toISOString(),
    profile,
    savedJobs,
    applications,
    savedSearches
  };
}


export interface JobAgentBackupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Restore the validated backup to app-owned keys. If any write fails, best-effort
 * rollback restores all prior app keys so quota errors don't leave mixed generations.
 */
export function restoreJobAgentBackupToStorage(storage: JobAgentBackupStorage, backup: JobAgentBackup): void {
  const snapshot = new Map<string, string | null>();
  for (const key of JOB_AGENT_LOCAL_STORAGE_KEYS) {
    snapshot.set(key, storage.getItem(key));
  }

  try {
    storage.setItem("job-agent.profile.v3", JSON.stringify(backup.profile));
    storage.setItem("job-agent.shortlist.v1", JSON.stringify(backup.savedJobs));
    storage.setItem("job-agent.applications.v1", JSON.stringify(backup.applications));
    storage.setItem("job-agent.saved-searches.v1", JSON.stringify(backup.savedSearches));
    storage.removeItem("job-agent.profile.v2");
    storage.removeItem("job-agent.profile.v1");
  } catch (error) {
    let rollbackFailed = false;
    for (const [key, value] of snapshot) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) {
      throw new Error("Backup restore failed and the browser could not fully roll back its prior local data.");
    }
    throw error;
  }
}
