# Free public preview deployment

This repository includes a Render Blueprint at the repository root. It creates the job-agent Docker web service on Render's **Free** instance tier and checks /api/health.

## Deploy it

1. Sign in to https://dashboard.render.com/.
2. Choose **New → Blueprint**.
3. Connect the GitHub repository vhcjhyy-ctrl/miorvane-store-.
4. Select branch main. Render should detect the root render.yaml.
5. Review the resource list and confirm the service plan is **Free** before selecting **Deploy Blueprint**.
6. Wait for the first deployment to finish. Render will show the public https://…onrender.com service URL.
7. Open that URL, then append /api/health. A healthy deployment returns JSON with "status":"ok".

## What works before Supabase is configured

The public UI, browser-local profile, saved searches, shortlist, application tracker, local CV parsing, match scoring, and live public job-feed search are designed to run without Supabase credentials. The optional AI cover-letter endpoint remains disabled.

## To enable real accounts and cloud sync

Create a Supabase project first, then set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the Render service environment. These public values are compiled into the Docker browser bundle, so changing them requires a new image build/deploy. Configure the deployed /auth/callback URL in Supabase Auth and apply the SQL migrations in job-agent/supabase/migrations/ in numeric order. Add server-only SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and a random JOB_SYNC_CRON_SECRET only in Render's private environment settings. Never commit these values.

Then set GitHub repository variable JOB_AGENT_BASE_URL to the deployed HTTPS origin and GitHub Actions secret JOB_SYNC_CRON_SECRET to the same random token to enable the scheduled catalog-ingestion workflow.

## Free-tier caveats

Render Free web services sleep after 15 minutes without inbound traffic and can take about a minute to wake. The free filesystem is ephemeral; user data must live in Supabase or the user's browser, not on the server disk. Free resources are intended for experiments and previews, not a production service with uptime guarantees. See https://render.com/docs/free for current limits.

## Current deployment status

The Blueprint is configured in GitHub, but a live service is not created automatically by a GitHub commit. A repository owner must authorize Render to access the repository and confirm Deploy Blueprint in the Render dashboard. No Render account, project, URL, or credentials are assumed here.
