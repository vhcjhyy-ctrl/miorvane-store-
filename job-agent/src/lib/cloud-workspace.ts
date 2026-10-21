import { parseJobAgentBackup, type JobAgentBackup } from "./backup";

export interface CloudWorkspaceData {
  profile: JobAgentBackup["profile"];
  savedJobs: JobAgentBackup["savedJobs"];
  applications: JobAgentBackup["applications"];
  savedSearches: JobAgentBackup["savedSearches"];
}

export interface CloudWorkspaceWriteRequest {
  expectedVersion: number;
  workspace: CloudWorkspaceData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reuse the strict backup parser so cloud and file-import validation cannot drift. */
export function parseCloudWorkspace(value: unknown): CloudWorkspaceData | null {
  if (!isRecord(value)) return null;
  const normalized = parseJobAgentBackup({
    schemaVersion: 2,
    exportedAt: "2026-01-01T00:00:00.000Z",
    profile: value.profile,
    savedJobs: value.savedJobs,
    applications: value.applications,
    savedSearches: value.savedSearches
  });
  if (!normalized) return null;

  return {
    profile: normalized.profile,
    savedJobs: normalized.savedJobs,
    applications: normalized.applications,
    savedSearches: normalized.savedSearches
  };
}

export function parseCloudWorkspaceWriteRequest(value: unknown): CloudWorkspaceWriteRequest | null {
  if (!isRecord(value)) return null;
  const expectedVersion = value.expectedVersion;
  if (
    typeof expectedVersion !== "number"
    || !Number.isSafeInteger(expectedVersion)
    || expectedVersion < 0
    || expectedVersion > 2_000_000_000
  ) return null;

  const workspace = parseCloudWorkspace(value.workspace);
  if (!workspace) return null;
  return { expectedVersion, workspace };
}
