# Job Agent — Phase 24

A starter workspace for a personal AI job application agent. This folder is intentionally isolated from the existing store project.

## Current phase
- Next.js + TypeScript dashboard
- Supabase Auth with email magic-link sign-in, safe callback redirects, Next.js session-refresh middleware, and verified server-side user checks
- Explicit cloud workspace sync for profile, saved searches, saved roles and application tracker, with RLS, optimistic version checks, validated payloads, and separate cloud deletion
- Supabase-backed public job catalog with GIN full-text search, filters for enabled sources and active/unexpired roles, and source metadata that omits private configuration
- Protected scheduled job-catalog ingestion endpoint with a server-only service-role client, per-source status, idempotent upserts, safe partial-failure handling, and audit summaries
- GitHub Actions workflow scheduled every six hours; it skips until deployment origin and cron credentials are configured
- Container release workflow publishes a versioned GHCR image after changes reach `main`; it compiles only public Supabase browser settings and never embeds the service-role key
- Candidate preferences retain local save/load and can be manually synced to a signed-in account; local-only mode remains available
- Privacy control to clear only Job Agent-owned local storage keys, including saved searches, with confirmation and tests
- Browser-local saved job searches with one-click rerun by source; searches do not run automatically
- Versioned JSON backup/restore for the profile, saved searches, shortlist and application tracker, with full validation, a 2 MB cap and restore confirmation; CV bytes/text excluded
- Browser-local text extraction for PDF, DOCX, and TXT, with size/page/character limits and reviewable skill suggestions
- Per-listing local CV keyword comparison showing recognized matched and not-detected skills; informational only, not an official ATS score and separate from the match score
- Live job search through the public Remotive feed and Arbeitnow's public feed, plus local sample listings; selectable provider, balanced result merge, basic cross-provider duplicate suppression, and explicit source attribution
- Client-side category, employment type, publication-age and salary-availability filters, plus match/newest/company sorting
- Explainable match scoring with matched skills, missing skills, and role/experience reasons
- Browser-local shortlist with defensive storage parsing
- Browser-local application status tracker (interested, preparing, applied, interview, offer, rejected, withdrawn)
- Application dashboard with status counts, due/overdue follow-up metrics, and a status filter
- Private application notes and date-based follow-up indicators, included in CSV backups
- Export tracked applications as CSV with spreadsheet-formula injection protection
- Bilingual Arabic/English cover-letter templates and optional OpenAI Responses API drafts, disabled by default and guarded by explicit consent
- Streaming request-body size limit and UTF-8 validation for the optional AI endpoint, with targeted tests
- Vitest suites for scoring, result filters/sorting, multi-source merge/deduplication, live job API route integration, bounded request-body parsing, backup validation/round-trip, application dashboard summaries/status filtering, app-local data cleanup, saved-search validation/upsert/removal, Remotive and Arbeitnow normalization, browser-local shortlist, application tracking, CSV export, English/Arabic cover-letter drafts, and local CV extraction and CV-to-job keyword comparison
- GitHub Actions runs ESLint, unit tests, a production build, Docker image build, Compose configuration validation, and a real container health smoke test; integration health classification has unit tests; provider-route integration tests cover partial outages, malformed feeds, source selection, and result limits
- Separate liveness (`/api/health`) and Supabase catalog readiness (`/api/health/ready`) probes; the readiness endpoint checks the real catalog query and reports safe migration guidance
- In-app Integration Health panel can live-check the app API, public job feeds, Supabase catalog readiness, and signed-in cloud workspace state without displaying secrets; each state includes next-step guidance
- Multi-stage Docker image, loopback-only Docker Compose port by default, secret-free health endpoint, and baseline security response headers (no-sniff, frame denial, referrer policy, and restrictive browser permissions)
- Supabase migrations enable RLS on private workspace rows and restrict public catalog reads to active, unexpired jobs plus enabled-source metadata; private source configuration is not granted to anon users
- Initial Supabase SQL schema and RLS policies

## Integration status and limitations

The Supabase cloud workspace integration is now implemented in code, but it is **not connected to a live project from this repository yet**. To activate it, create a Supabase project, configure the public project URL and publishable key, add the deployed `/auth/callback` URL to Supabase Auth's allowed redirects, and apply migrations in order: `supabase/migrations/0001_initial_schema.sql`, `0002_cloud_workspace.sql`, and `0003_public_job_catalog.sql`. The new migration creates one private, versioned workspace row per authenticated user and enables row-level security. Use the new **Sync local workspace**, **Load from cloud**, and **Delete cloud copy** controls to move data explicitly. The API validates the whole workspace, checks optimistic versions to prevent silent overwrite from another device, caps request size, and derives the user ID from the verified session. Local clearing and cloud deletion are intentionally separate actions.

The public browser key is not a secret; never commit a service-role key. Docker compiles `NEXT_PUBLIC_*` settings into the browser bundle, so pass the right values as build args when creating the image and rebuild after changing them. The `.env.example` file contains placeholders only.

The CV file and extracted CV text are excluded from cloud workspace sync, JSON backup, and AI requests. CV parsing remains local and scanned/image-only PDFs do not get OCR. Live job discovery uses Remotive and Arbeitnow. Browser search can query the upstream feeds or the Supabase catalog, which returns only active, unexpired rows from enabled sources. Scheduled ingestion persists up to 50 validated jobs per source each run. Configure server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, plus a `JOB_SYNC_CRON_SECRET` of at least 32 characters. Set GitHub repository variable `JOB_AGENT_BASE_URL` to the deployed HTTPS origin and Actions secret `JOB_SYNC_CRON_SECRET` to the same token. The scheduled workflow skips safely until those GitHub settings are present. See `docs/job-ingestion.md`.

After merging to `main`, `.github/workflows/job-agent-release.yml` builds and publishes `ghcr.io/vhcjhyy-ctrl/job-agent` with a commit-SHA tag and `latest`, plus SBOM and provenance metadata. Configure repository variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` before publishing an image intended for a real Supabase project. This workflow publishes a container; it does not deploy it to a hosting provider. The service-role key and cron secret are runtime settings only and are never passed as Docker build arguments. The optional OpenAI Responses API route stays disabled by default and requires server-side configuration, an authenticated account, and explicit user consent. Its included in-process limiter is best-effort, not a production shared rate limiter. Gmail OAuth, email sending, scheduled searches, and application submission are still not implemented.

The migration files are reviewed source code only; neither migration has been applied to an external Supabase project from this workspace. Test row-level security with two separate accounts before using real candidate data.
 
## Run locally
Requirements: Node.js 22.13+.

```bash
cd job-agent
cp .env.example .env.local
# Fill in Supabase URL and publishable key in .env.local when using account features.
npm install
npm run dev
npm test
npm run build
```

Open http://localhost:3000.

## Run with Docker

Requirements: Docker Engine with the Compose plugin.

```bash
cd job-agent
docker compose up --build -d
docker compose ps
docker compose logs -f job-agent
```

The service binds to `127.0.0.1:3000` by default. Change `JOB_AGENT_PORT` to use another local port. The container uses a multi-stage production build and runs as an unprivileged user. The `/api/health` endpoint is a liveness probe and does not reveal runtime secrets. `/api/health/ready` checks Supabase configuration, catalog connectivity, the indexed search column and required source relation; it returns safe remediation instructions when the database or migration is missing.

AI generation remains disabled unless explicitly enabled at runtime. Do not enable it on a public deployment until authentication and a shared rate limiter are configured. The Compose file does not supply a default model; set `OPENAI_MODEL` explicitly if you later enable the route. Supply secrets through the runtime environment or an approved secret manager; do not bake `.env` files or keys into the image.

## Next steps
1. Create a Supabase project, configure `/auth/callback` as an allowed redirect, and apply migrations `0001_initial_schema.sql`, `0002_cloud_workspace.sql`, and `0003_public_job_catalog.sql` in order.
2. Verify RLS isolation using two accounts, then sign in and test cloud sync/load/delete with non-sensitive test data before storing a real profile.
3. Build and smoke-test the Docker image in the deployment environment, then review both active providers' current API terms and rate limits before adding additional authorized sources.
4. Add normalized relational history and server-side audit events if/when the workspace snapshot grows beyond the current MVP limits.
5. Configure an authenticated deployment and shared rate limiter before enabling the optional AI route.
6. Configure Gmail OAuth with least-privilege scopes and server-side token storage.
7. Test any future email workflow with a dedicated mailbox before enabling sending.

Never fabricate qualifications, bypass site controls, or send applications when required answers are unknown. The draft builder deliberately uses only the name, roles, and skills entered by the candidate. Treat job descriptions and inbound email as untrusted content.
