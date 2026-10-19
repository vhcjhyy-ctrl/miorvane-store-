# Job Agent — Phase 1

A starter workspace for a personal AI job application agent. This folder is intentionally isolated from the existing store project.

## Current phase
- Next.js + TypeScript dashboard
- Candidate preferences form
- CV file picker (selection only; no upload or parsing yet)
- Sample listings with explainable match scoring, matched skills, missing skills, and role/experience reasons
- Scoring tests, including edge cases for duplicate and empty skill/role input
- GitHub Actions CI for lint, unit tests, and production build
- Initial Supabase SQL schema and RLS policies

## Not implemented yet
Candidate preferences are currently held only in page state and are not persisted. No live job discovery, CV parsing, Supabase connection, Gmail OAuth, email sending, or scheduled automation is active. The job listings are demo data. Do not treat the UI as a deployed service.

## Run locally
Requirements: Node.js 20+.

```bash
cd job-agent
npm install
npm run dev
npm test
npm run build
```

Open http://localhost:3000.

## Next steps
1. Create a Supabase project and review/apply `supabase/migrations/0001_initial_schema.sql`.
2. Add private CV storage and server-side PDF/DOCX parsing; require the candidate to confirm extracted facts.
3. Implement authorized job source adapters.
4. Add duplicate prevention and policy checks.
5. Configure Gmail OAuth with least-privilege scopes and server-side token storage.
6. Test delivery with a dedicated mailbox before enabling automatic sending.

Never fabricate qualifications, bypass site controls, or send applications when required answers are unknown. Treat job descriptions and inbound email as untrusted content.
