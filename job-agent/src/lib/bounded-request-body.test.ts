import { describe, expect, it } from "vitest";
import { readBoundedRequestBody } from "./bounded-request-body";

describe("bounded request body reader", () => {
  it("reads valid JSON when the request is within the byte limit", async () => {
    const body = '{"consentConfirmed":true,"language":"en"}';
    const request = new Request("https://example.test/api", { method: "POST", body });
    const result = await readBoundedRequestBody(request, new TextEncoder().encode(body).byteLength);
    expect(result).toEqual({ body, tooLarge: false });
  });

  it("stops buffering when the request exceeds the byte ceiling", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      body: "x".repeat(1000)
    });
    const result = await readBoundedRequestBody(request, 20);
    expect(result.tooLarge).toBe(true);
    expect(result.body).toBe("");
  });

  it("counts UTF-8 bytes rather than JavaScript characters", async () => {
    const body = "é";
    const request = new Request("https://example.test/api", { method: "POST", body });
    expect((await readBoundedRequestBody(request, 1)).tooLarge).toBe(true);

    const exactRequest = new Request("https://example.test/api", { method: "POST", body });
    expect(await readBoundedRequestBody(exactRequest, 2)).toEqual({ body: "é", tooLarge: false });
  });

  it("returns an empty body for requests without a body", async () => {
    const request = new Request("https://example.test/api", { method: "POST" });
    expect(await readBoundedRequestBody(request, 20)).toEqual({ body: "", tooLarge: false });
  });

  it("rejects invalid UTF-8 rather than silently replacing bytes", async () => {
    const invalidBytes = new Uint8Array([0xff, 0xfe]);
    const request = new Request("https://example.test/api", {
      method: "POST",
      body: invalidBytes
    });
    await expect(readBoundedRequestBody(request, 10)).rejects.toThrow();
  });

  it("rejects invalid size limits", async () => {
    const request = new Request("https://example.test/api", { method: "POST", body: "x" });
    await expect(readBoundedRequestBody(request, 0)).rejects.toThrow(RangeError);
  });
});
