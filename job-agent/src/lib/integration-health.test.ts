import { describe, expect, it } from "vitest";
import { buildIntegrationHealthReport, type HealthProbe } from "./integration-health";

const ok = (payload: unknown): HealthProbe => ({ ok: true, status: 200, payload });
const failed = (status: number, payload: unknown): HealthProbe => ({ ok: false, status, payload });

describe("integration health report", () => {
  it("reports all services connected when all endpoints respond successfully", () => {
    const report = buildIntegrationHealthReport({
      application: ok({ status: "ok" }),
      liveJobs: ok({ jobs: [], warnings: [] }),
      catalog: ok({ status: "ready", checks: { supabase: "connected", catalog: "ready" } }),
      cloudWorkspace: ok({ version: 0, workspace: null })
    });
    expect(report.application.state).toBe("connected");
    expect(report.liveJobs.state).toBe("connected");
    expect(report.catalog.state).toBe("connected");
    expect(report.cloudWorkspace.state).toBe("connected");
    expect(report.liveJobs.detail).toContain("Zero matching jobs");
  });

  it("marks live sources as partial when one provider reports a warning", () => {
    const report = buildIntegrationHealthReport({
      application: ok({ status: "ok" }),
      liveJobs: ok({ jobs: [], warnings: ["Arbeitnow is temporarily unavailable."] }),
      catalog: failed(503, { checks: { supabase: "unconfigured" }, remediation: "Set Supabase URL and key." }),
      cloudWorkspace: failed(401, { error: "Sign in first." })
    });
    expect(report.liveJobs).toEqual({
      state: "partial",
      detail: "Arbeitnow is temporarily unavailable."
    });
    expect(report.catalog.state).toBe("setup_required");
    expect(report.cloudWorkspace.state).toBe("sign_in_required");
  });

  it("distinguishes unconfigured catalog from a runtime outage", () => {
    expect(evaluateCatalogForTest(failed(503, {
      status: "not_ready",
      checks: { supabase: "connected", schema: "migration_required" },
      remediation: "Apply migration 0003."
    })).state).toBe("setup_required");

    expect(evaluateCatalogForTest(failed(503, {
      status: "not_ready",
      checks: { supabase: "error", catalog: "not_checked" }
    })).state).toBe("unavailable");
  });

  it("does not treat malformed successful payloads as healthy", () => {
    const report = buildIntegrationHealthReport({
      application: ok({ status: "unknown" }),
      liveJobs: ok({ data: [] }),
      catalog: ok({ status: "unknown" }),
      cloudWorkspace: ok({ workspace: null })
    });
    expect(report.application.state).toBe("unavailable");
    expect(report.liveJobs.state).toBe("unavailable");
    expect(report.catalog.state).toBe("unavailable");
    expect(report.cloudWorkspace.state).toBe("unavailable");
  });
});

import { evaluateSupabaseCatalog as evaluateCatalogForTest } from "./integration-health";
