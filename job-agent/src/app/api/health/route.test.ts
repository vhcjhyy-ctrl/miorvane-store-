import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("health route", () => {
  it("returns an OK response without exposing runtime configuration", async () => {
    const response = GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("job-agent");
    expect(typeof payload.timestamp).toBe("string");
    expect(payload).not.toHaveProperty("OPENAI_API_KEY");
    expect(payload).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });
});
