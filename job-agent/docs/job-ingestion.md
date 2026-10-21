# Scheduled job catalog ingestion

This worker ingests up to 50 validated listings from each public provider per run into the shared Supabase catalog. Public catalog search uses the read-only RLS policy and the GIN-indexed `search_vector` created by migration 0003.

## Required server settings

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never use a `NEXT_PUBLIC_*` variable
- `JOB_SYNC_CRON_SECRET` — at least 32 random characters

The endpoint is `POST /api/internal/jobs/sync` with `Authorization: Bearer <JOB_SYNC_CRON_SECRET>`. Public catalog reads use `GET /api/jobs/catalog` and require the public Supabase URL/key plus migration 0003. It returns 503 if required configuration is missing, and 401 for an invalid token. The token is compared using fixed-length SHA-256 digests and the route never returns or logs the key.

The scheduled GitHub Actions workflow runs every six hours and expects repository variable `JOB_AGENT_BASE_URL` and Actions secret `JOB_SYNC_CRON_SECRET`. It safely skips the run if either is missing. Configure that variable to the HTTPS origin of the deployed Job Agent (no trailing path). For the container release, merge to `main`; the release workflow publishes a versioned image to `ghcr.io/vhcjhyy-ctrl/job-agent`. The deployed application also needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in its hosting environment.

## What the worker does

1. Fetches the public Remotive and Arbeitnow feeds with provider timeouts and caching.
2. Validates provider data through the existing safe normalizers and bounds each provider to 50 jobs per run.
3. Upserts `job_sources`, upserts jobs by `source_id,external_id`, and records a sanitized audit summary.
4. Keeps existing catalog rows when an upstream source fails or a feed returns fewer entries. It intentionally does not mark absent listings inactive because public feeds can be paginated, delayed, or limited.

## Manual test

After deploying and applying migrations 0001 and 0003, send a POST with the configured bearer token from a trusted terminal or run the workflow manually. The endpoint itself does not accept a source list or query string, and it never exposes upstream response bodies or service-role credentials.

This feature is not active until the migration, deployment variables, and GitHub Actions settings are configured. Do not paste the service-role key into issues, commits, or chat.
