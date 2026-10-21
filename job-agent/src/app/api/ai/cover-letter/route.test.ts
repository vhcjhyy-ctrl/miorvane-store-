import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const validPayload = {
  consentConfirmed: true,
  candidateName: "Test Candidate",
  targetRoles: ["Backend Developer"],
  candidateSkills: ["TypeScript", "SQL"],
  jobSkills: ["TypeScript", "SQL", "Docker"],
  jobTitle: "Backend Developer",
  company: "Example GmbH",
  jobDescription: "Build APIs and maintain data services.",
  language: "en",
  cvText: "This secret must never be forwarded.",
  unknownField: "This must also be dropped."
};

function makeRequest(payload: unknown, ip = "203.0.113.101") {
  return new Request("http://localhost/api/ai/cover-letter", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": ip
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  });
}

function successfulUpstreamResponse(text = "A careful, factual cover letter.") {
  return new Response(JSON.stringify({ output_text: text }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("AI cover-letter API route", () => {
  beforeEach(() => {
    vi.stubEnv("AI_COVER_LETTER_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubEnv("OPENAI_MODEL", "test-model-id");
    vi.stubGlobal("fetch", vi.fn(async () => successfulUpstreamResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is disabled by default and makes no upstream request", async () => {
    vi.stubEnv("AI_COVER_LETTER_ENABLED", "false");
    const response = await POST(makeRequest(validPayload, "203.0.113.111"));
    expect(response.status).toBe(503);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("requires an explicit model identifier when enabled", async () => {
    vi.stubEnv("OPENAI_MODEL", "");
    const response = await POST(makeRequest(validPayload, "203.0.113.112"));
    expect(response.status).toBe(503);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("rejects missing consent before calling the provider", async () => {
    const response = await POST(makeRequest({ ...validPayload, consentConfirmed: false }, "203.0.113.113"));
    expect(response.status).toBe(400);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("rejects a streaming body that exceeds the byte ceiling", async () => {
    const response = await POST(makeRequest("x".repeat(20_100), "203.0.113.114"));
    expect(response.status).toBe(413);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("sends only validated fields, uses the configured model, and disables response storage", async () => {
    const response = await POST(makeRequest(validPayload, "203.0.113.115"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ draft: "A careful, factual cover letter.", model: "test-model-id" });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("authorization")).toBe("Bearer test-only-key");

    const upstreamBody = JSON.parse(String(options?.body)) as {
      model: string;
      store: boolean;
      input: string;
    };
    expect(upstreamBody.model).toBe("test-model-id");
    expect(upstreamBody.store).toBe(false);
    expect(upstreamBody.input).toContain("Test Candidate");
    expect(upstreamBody.input).toContain("Backend Developer");
    expect(upstreamBody.input).not.toContain("This secret must never be forwarded");
    expect(upstreamBody.input).not.toContain("unknownField");
  });

  it("returns a safe provider error when upstream responds unsuccessfully", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider secret error", { status: 429 })));
    const response = await POST(makeRequest(validPayload, "203.0.113.116"));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "The AI provider could not generate this draft. Check the server-side model/key configuration and provider quota."
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("applies the per-process request cap after four accepted requests for a key", async () => {
    const ip = "203.0.113.117";
    for (let index = 0; index < 4; index += 1) {
      expect((await POST(makeRequest(validPayload, ip))).status).toBe(200);
    }
    const blocked = await POST(makeRequest(validPayload, ip));
    expect(blocked.status).toBe(429);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  });
});
