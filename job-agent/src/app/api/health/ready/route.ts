import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" }
  });
}

/**
 * Readiness checks public catalog connectivity and required migration columns.
 * This endpoint intentionally returns sanitized state only, never DB errors or secrets.
 */
export async function GET() {
  let client;
  try {
    client = await createServerSupabaseClient();
  } catch {
    return response(503, {
      status: "not_ready",
      checks: { supabase: "error", catalog: "not_checked" }
    });
  }

  if (!client) {
    return response(503, {
      status: "not_ready",
      checks: { supabase: "unconfigured", catalog: "not_checked" },
      remediation: "Set the Supabase project URL and public publishable key."
    });
  }

  try {
    const { error } = await client
      .from("jobs")
      .select("id,external_id,search_vector,salary_text,category,job_type,job_sources!inner(id,source_key,display_name,enabled)")
      .eq("active", true)
      .eq("job_sources.enabled", true)
      .limit(1);

    if (error) {
      const missingSchema = error.code === "42P01" || error.code === "PGRST205"
        || error.code === "42703" || error.code === "PGRST204";
      return response(503, {
        status: "not_ready",
        checks: {
          supabase: "connected",
          catalog: "error",
          schema: missingSchema ? "migration_required" : "query_failed"
        },
        remediation: missingSchema
          ? "Apply migrations 0001_initial_schema.sql and 0003_public_job_catalog.sql in order."
          : "Check the public catalog RLS policy and column grants."
      });
    }

    return response(200, {
      status: "ready",
      checks: { supabase: "connected", catalog: "ready" },
      timestamp: new Date().toISOString()
    });
  } catch {
    return response(503, {
      status: "not_ready",
      checks: { supabase: "error", catalog: "not_checked" }
    });
  }
}
