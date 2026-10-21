import { describe, expect, it } from "vitest";
import {
  clearJobAgentLocalData,
  JOB_AGENT_LOCAL_STORAGE_KEYS,
  type LocalStorageRemover
} from "./local-data";

function createMemoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  const removed: string[] = [];
  const storage: LocalStorageRemover = {
    removeItem(key: string) {
      removed.push(key);
      values.delete(key);
    }
  };
  return { storage, values, removed };
}

describe("Job Agent local data cleanup", () => {
  it("removes the app's supported versioned keys including saved searches", () => {
    expect(JOB_AGENT_LOCAL_STORAGE_KEYS).toContain("job-agent.saved-searches.v1");
    const initial = Object.fromEntries(JOB_AGENT_LOCAL_STORAGE_KEYS.map(key => [key, "private-data"]));
    const memory = createMemoryStorage(initial);
    clearJobAgentLocalData(memory.storage);

    expect(memory.values.size).toBe(0);
    expect(memory.removed).toEqual(JOB_AGENT_LOCAL_STORAGE_KEYS);
  });

  it("leaves unrelated browser storage entries untouched", () => {
    const memory = createMemoryStorage({
      "job-agent.profile.v2": "profile",
      "other-app.settings": "keep me",
      "shopping-cart": "keep this too"
    });
    clearJobAgentLocalData(memory.storage);

    expect(memory.values.get("other-app.settings")).toBe("keep me");
    expect(memory.values.get("shopping-cart")).toBe("keep this too");
    expect(memory.values.has("job-agent.profile.v2")).toBe(false);
  });

  it("stops and reports a storage failure instead of pretending cleanup succeeded", () => {
    let calls = 0;
    const throwingStorage: LocalStorageRemover = {
      removeItem() {
        calls += 1;
        throw new Error("storage disabled");
      }
    };

    expect(() => clearJobAgentLocalData(throwingStorage)).toThrow("storage disabled");
    expect(calls).toBe(1);
  });
});
