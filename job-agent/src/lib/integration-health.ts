export type ConnectionState =
  | "connected"
  | "partial"
  | "setup_required"
  | "sign_in_required"
  | "unavailable";

export interface ConnectionCheck {
  state: ConnectionState;
  detail: string;
}

export interface HealthProbe {
  ok: boolean;
  status: number;
  payload: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 400) : "";
}

function errorMessage(probe: HealthProbe): string {
  return isRecord(probe.payload) ? textField(probe.payload.error) : "";
}

export function evaluateApplicationHealth(probe: HealthProbe): ConnectionCheck {
  if (probe.ok && isRecord(probe.payload) && probe.payload.status === "ok") {
    return { state: "connected", detail: "The application health endpoint responded successfully." };
  }
  return { state: "unavailable", detail: "The application health endpoint did not return a healthy response." };
}

export function evaluateLiveJobSources(probe: HealthProbe): ConnectionCheck {
  if (!probe.ok || !isRecord(probe.payload) || !Array.isArray(probe.payload.jobs)) {
    const message = errorMessage(probe);
    return {
      state: "unavailable",
      detail: message || "The live job search endpoint did not return a valid response."
    };
  }

  const warnings = Array.isArray(probe.payload.warnings)
    ? probe.payload.warnings.filter((item): item is string => typeof item === "string")
    : [];
  if (warnings.length > 0) {
    return { state: "partial", detail: warnings.join(" ").slice(0, 400) };
  }

  return {
    state: "connected",
    detail: "The live search endpoint responded without provider warnings. Zero matching jobs can be a valid result."
  };
}

export function evaluateSupabaseCatalog(probe: HealthProbe): ConnectionCheck {
  if (probe.ok && isRecord(probe.payload) && probe.payload.status === "ready") {
    return { state: "connected", detail: "Supabase is reachable and the public job catalog query succeeded." };
  }

  const payload = isRecord(probe.payload) ? probe.payload : {};
  const checks = isRecord(payload.checks) ? payload.checks : {};
  if (checks.supabase === "unconfigured" || checks.schema === "migration_required") {
    return {
      state: "setup_required",
      detail: textField(payload.remediation) || "Configure the Supabase public URL and publishable key, then apply the listed migrations."
    };
  }

  if (probe.status === 503) {
    return {
      state: "unavailable",
      detail: textField(payload.remediation) || "The Supabase catalog is not ready. Check the project connection and migration/RLS configuration."
    };
  }

  return { state: "unavailable", detail: "The Supabase catalog readiness check did not succeed." };
}

export function evaluateCloudWorkspace(probe: HealthProbe): ConnectionCheck {
  if (probe.ok && isRecord(probe.payload) && typeof probe.payload.version === "number") {
    return {
      state: "connected",
      detail: probe.payload.workspace === null
        ? "Account workspace endpoint is reachable; no cloud copy exists for this account yet."
        : "Account workspace endpoint is reachable and returned a validated cloud snapshot."
    };
  }

  if (probe.status === 401) {
    return { state: "sign_in_required", detail: "Sign in to a verified Supabase account to use cloud workspace sync." };
  }

  const message = errorMessage(probe);
  if (probe.status === 503 && /not configured|not installed|migration|could not be initialized/i.test(message)) {
    return {
      state: "setup_required",
      detail: message || "Configure Supabase and apply migration 0002_cloud_workspace.sql."
    };
  }

  return {
    state: "unavailable",
    detail: message || "The account workspace endpoint did not respond successfully."
  };
}

export interface IntegrationHealthReport {
  application: ConnectionCheck;
  liveJobs: ConnectionCheck;
  catalog: ConnectionCheck;
  cloudWorkspace: ConnectionCheck;
}

export function buildIntegrationHealthReport(input: {
  application: HealthProbe;
  liveJobs: HealthProbe;
  catalog: HealthProbe;
  cloudWorkspace: HealthProbe;
}): IntegrationHealthReport {
  return {
    application: evaluateApplicationHealth(input.application),
    liveJobs: evaluateLiveJobSources(input.liveJobs),
    catalog: evaluateSupabaseCatalog(input.catalog),
    cloudWorkspace: evaluateCloudWorkspace(input.cloudWorkspace)
  };
}
