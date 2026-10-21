# Production launch runbook

## Current deployment state

The application is prepared for a Docker-based Render web service through the repository-root `render.yaml`. The blueprint is a deploy configuration, not a live deployment. No public application URL or external Supabase project is configured by this repository as of this review.

With the default empty Supabase browser variables, the app should still run, show live Remotive and Arbeitnow search, and preserve the local-only workflow. Sign-in, cloud workspace sync, and the database catalog remain unavailable until a real Supabase project is connected.

## 1. Deploy the web application

1. Sign in to Render and create a new Blueprint from this GitHub repository.
2. For the first preview, select the `feature/ai-job-agent-phase1` branch. After the pull request is approved and merged, switch the Render service to `main`.
3. Let Render read the root `render.yaml`, build `job-agent/Dockerfile`, and deploy the web service. The health check is `/api/health`.
4. Open the Render service URL. Confirm the home page loads and the **Test connections** panel reports the application API and live job feeds. Supabase may correctly report **Setup required** until the next steps are complete.

The blueprint keeps AI cover-letter generation disabled. It does not configure a database or any provider secret.

## 2. Connect a real Supabase project

1. Create a Supabase project in your own account.
2. In Render's Environment settings, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the project's URL and publishable key. The older `NEXT_PUBLIC_SUPABASE_ANON_KEY` is supported for compatibility, but prefer the publishable key.
3. Rebuild and redeploy after changing these `NEXT_PUBLIC_*` values because Next.js compiles them into the browser bundle. These public settings are not a substitute for server secrets.
4. Apply SQL migrations in order from the Supabase SQL editor:
   - `job-agent/supabase/migrations/0001_initial_schema.sql`
   - `job-agent/supabase/migrations/0002_cloud_workspace.sql`
   - `job-agent/supabase/migrations/0003_public_job_catalog.sql`
5. In Supabase Auth, set the deployed site URL and allow the exact callback URL `https://YOUR-RENDER-SERVICE.onrender.com/auth/callback`. Also add your local development callback URL if you will test locally.
6. Open `https://YOUR-RENDER-SERVICE.onrender.com/api/health/ready`. A ready configuration returns HTTP 200 and `"status":"ready"`. Use the in-app **Test connections** panel to see the same result alongside the live source checks.

Test sign-in, workspace sync, restore, and cloud deletion using a test account first. Do not store real candidate information until the RLS behavior has been verified.

## 3. Activate the shared job catalog

Add the following **server-only** Render environment variables after the Supabase project is ready:

- `SUPABASE_URL`: the project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the project's service-role secret. Never prefix it with `NEXT_PUBLIC_` or commit it to Git.
- `JOB_SYNC_CRON_SECRET`: a cryptographically random secret of at least 32 characters.

Then add these settings in GitHub repository **Settings → Secrets and variables → Actions**:

- Repository variable `JOB_AGENT_BASE_URL`: only the deployed HTTPS origin, for example `https://YOUR-RENDER-SERVICE.onrender.com` (no path, query, or trailing endpoint).
- Repository secret `JOB_SYNC_CRON_SECRET`: exactly the same secret as the Render variable.

Run **Actions → Job Agent Catalog Sync → Run workflow** once. The workflow must return HTTP 200 or 207. Check `/api/health/ready`, then choose **Supabase catalog** in the app's Job source selector. The scheduled workflow retries ingestion every six hours after the repository settings are configured; it skips safely when they are absent.

## 4. Optional AI letters and future email

Keep `AI_COVER_LETTER_ENABLED=false` until you deliberately configure `OPENAI_API_KEY`, a valid explicit `OPENAI_MODEL`, and a shared production rate limiter. The route remains disabled by default. Never upload CV text to an AI provider without user consent.

Gmail OAuth, sending email, automatically applying to jobs, unattended saved-search runs, and production notification delivery are not implemented. The UI does not pretend these actions happened.

## 5. Acceptance checklist

- [ ] Render deploy completes and `/api/health` returns HTTP 200.
- [ ] The integration panel reports the app and both live job sources healthy.
- [ ] Supabase `/api/health/ready` returns HTTP 200 after migrations.
- [ ] Magic-link login and callback work on the deployed HTTPS domain.
- [ ] Two separate test accounts cannot read or change one another's cloud workspace.
- [ ] Workspace sync, stale-version conflict handling, cloud deletion, JSON backup and restore work.
- [ ] Catalog sync reports at least one provider successfully refreshed and catalog search returns source-attributed listings.
- [ ] GitHub scheduled ingestion is configured and its latest run succeeds.
- [ ] Secrets remain in Render/GitHub settings and no server-only key appears in browser assets or logs.
- [ ] AI stays disabled until its shared rate limiter and end-to-end consent tests are accepted.
