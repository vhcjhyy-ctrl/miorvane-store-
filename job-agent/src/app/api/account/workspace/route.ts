import { NextResponse } from "next/server";
import { readBoundedRequestBody } from "../../../../lib/bounded-request-body";
import { parseCloudWorkspace, parseCloudWorkspaceWriteRequest } from "../../../../lib/cloud-workspace";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "job_agent_workspaces";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const SELECT_COLUMNS = "version,profile,saved_jobs,applications,saved_searches,updated_at";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" }
  });
}

function databaseUnavailable(error: { code?: string } | null, action: string) {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    return json({
      error: "The cloud workspace table is not installed. Apply job-agent/supabase/migrations/0002_cloud_workspace.sql in the connected Supabase project."
    }, 503);
  }
  return json({
    error: "Could not " + action + " the cloud workspace. Check the Supabase project, migration, and row-level security configuration."
  }, 503);
}

async function getContext() {
  let client;
  try {
    client = await createServerSupabaseClient();
  } catch {
    return { response: json({ error: "Supabase client could not be initialized." }, 503) } as const;
  }
  if (!client) {
    return { response: json({ error: "Cloud sync is not configured. Set the public Supabase project URL and publishable key." }, 503) } as const;
  }

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return { response: json({ error: "Sign in to a verified Job Agent account before using cloud sync." }, 401) } as const;
    }
    return { client, userId: data.user.id } as const;
  } catch {
    return { response: json({ error: "Could not verify your account session. Sign in again and retry." }, 401) } as const;
  }
}

function toWorkspaceResponse(row: {
  version: number;
  profile: unknown;
  saved_jobs: unknown;
  applications: unknown;
  saved_searches: unknown;
  updated_at: string;
}) {
  const workspace = parseCloudWorkspace({
    profile: row.profile,
    savedJobs: row.saved_jobs,
    applications: row.applications,
    savedSearches: row.saved_searches
  });
  if (!workspace || !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isFinite(Date.parse(row.updated_at))) {
    return null;
  }
  return {
    version: row.version,
    updatedAt: new Date(row.updated_at).toISOString(),
    workspace
  };
}

export async function GET() {
  const context = await getContext();
  if ("response" in context) return context.response;

  try {
    const { data, error } = await context.client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) return databaseUnavailable(error, "read");
    if (!data) return json({ version: 0, updatedAt: null, workspace: null });

    const normalized = toWorkspaceResponse(data as {
      version: number;
      profile: unknown;
      saved_jobs: unknown;
      applications: unknown;
      saved_searches: unknown;
      updated_at: string;
    });
    if (!normalized) return json({ error: "The saved cloud workspace is invalid. Local data has not been changed." }, 500);
    return json(normalized);
  } catch {
    return json({ error: "Could not read the cloud workspace. Please retry." }, 503);
  }
}

export async function PUT(request: Request) {
  const context = await getContext();
  if ("response" in context) return context.response;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Cloud workspace payload exceeds the 2 MB limit." }, 413);
  }

  let rawBody: string;
  try {
    const result = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
    if (result.tooLarge) return json({ error: "Cloud workspace payload exceeds the 2 MB limit." }, 413);
    rawBody = result.body;
  } catch {
    return json({ error: "Could not read a valid UTF-8 cloud workspace payload." }, 400);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return json({ error: "Cloud workspace payload must be valid JSON." }, 400);
  }

  const payload = parseCloudWorkspaceWriteRequest(raw);
  if (!payload) {
    return json({
      error: "The cloud workspace is invalid or exceeds supported limits. No cloud data was changed."
    }, 400);
  }

  const row = {
    user_id: context.userId,
    version: payload.expectedVersion + 1,
    profile: payload.workspace.profile,
    saved_jobs: payload.workspace.savedJobs,
    applications: payload.workspace.applications,
    saved_searches: payload.workspace.savedSearches,
    updated_at: new Date().toISOString()
  };

  try {
    const result = payload.expectedVersion === 0
      ? await context.client.from(TABLE).insert(row).select(SELECT_COLUMNS).maybeSingle()
      : await context.client.from(TABLE)
          .update({
            version: row.version,
            profile: row.profile,
            saved_jobs: row.saved_jobs,
            applications: row.applications,
            saved_searches: row.saved_searches,
            updated_at: row.updated_at
          })
          .eq("user_id", context.userId)
          .eq("version", payload.expectedVersion)
          .select(SELECT_COLUMNS)
          .maybeSingle();

    if (result.error) {
      if (result.error.code === "23505") {
        return json({ error: "A cloud workspace already exists. Load the account workspace before syncing local changes." }, 409);
      }
      return databaseUnavailable(result.error, "save");
    }
    if (!result.data) {
      return json({ error: "The cloud workspace changed in another session. Load the latest cloud copy before syncing again." }, 409);
    }

    const normalized = toWorkspaceResponse(result.data as {
      version: number;
      profile: unknown;
      saved_jobs: unknown;
      applications: unknown;
      saved_searches: unknown;
      updated_at: string;
    });
    if (!normalized) return json({ error: "The saved cloud workspace could not be validated after writing." }, 500);
    return json(normalized);
  } catch {
    return json({ error: "Could not save the cloud workspace. Local data has been kept unchanged." }, 503);
  }
}

export async function DELETE() {
  const context = await getContext();
  if ("response" in context) return context.response;

  try {
    const { data, error } = await context.client
      .from(TABLE)
      .delete()
      .eq("user_id", context.userId)
      .select("user_id");

    if (error) return databaseUnavailable(error, "delete");
    return json({ deleted: Array.isArray(data) && data.length > 0 });
  } catch {
    return json({ error: "Could not delete the cloud workspace. No local data was deleted." }, 503);
  }
}
