/**
 * Storage keys owned by the Job Agent UI. Keep this list explicit so cleanup
 * never touches local data belonging to other websites or applications.
 */
export const JOB_AGENT_LOCAL_STORAGE_KEYS = [
  "job-agent.profile.v3",
  "job-agent.profile.v2",
  "job-agent.profile.v1",
  "job-agent.shortlist.v1",
  "job-agent.applications.v1",
  "job-agent.saved-searches.v1"
] as const;

export type LocalStorageRemover = Pick<Storage, "removeItem">;

/** Remove only this app's persisted local data. Throws if the storage API is unavailable. */
export function clearJobAgentLocalData(storage: LocalStorageRemover): void {
  for (const key of JOB_AGENT_LOCAL_STORAGE_KEYS) {
    storage.removeItem(key);
  }
}
