# Job Agent — Phase 2

A starter workspace for a personal AI job application agent. This folder is intentionally isolated from the existing store project.

## Current phase
- Next.js + TypeScript dashboard
- Candidate preferences form with explicit browser-local save/load (no cloud upload)
- CV file picker (selection only; no upload or parsing yet)
- Live remote-job search through the public Remotive feed, plus local sample listings
- Explainable match scoring with matched skills, missing skills, and role/experience reasons
- Scoring tests, including edge cases for duplicate and empty skill/role input
- GitHub Actions runs ESLint, unit tests, and a production build on changes
- Initial Supabase SQL schema and RLS policies

## Not implemented yet
Candidate preferences can be explicitly saved to and loaded from browser local storage; CV files are not stored. Live search is read-only and uses Remotive's public API. Upstream data is cached for six hours, listings link back to Remotive, and results may be delayed by 24 hours. The source recommends no more than four upstream requests per day. This is not a broad all-market search. CV parsing, Supabase connection, Gmail OAuth, email sending, and scheduled automation are not active. Demo data remains available.

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
3. Review Remotive's current API terms and add other authorized job source adapters with their own attribution and rate limits.
4. Add duplicate prevention and policy checks.
5. Configure Gmail OAuth with least-privilege scopes and server-side token storage.
6. Test delivery with a dedicated mailbox before enabling automatic sending.

Never fabricate qualifications, bypass site controls, or send applications when required answers are unknown. Treat job descriptions and inbound email as untrusted content.
