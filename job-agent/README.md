# Job Agent — Phase 5

A starter workspace for a personal AI job application agent. This folder is intentionally isolated from the existing store project.

## Current phase
- Next.js + TypeScript dashboard
- Candidate preferences form with explicit browser-local save/load (no cloud upload)
- Browser-local text extraction for PDF, DOCX, and TXT, with size/page/character limits and reviewable skill suggestions
- Live remote-job search through the public Remotive feed, plus local sample listings
- Explainable match scoring with matched skills, missing skills, and role/experience reasons
- Browser-local shortlist with defensive storage parsing
- Browser-local application status tracker (interested, preparing, applied, interview, offer, rejected, withdrawn)
- Editable cover-letter template generated locally from candidate-entered fields; copy only, no sending
- Vitest suites for scoring, Remotive normalization, browser-local shortlist, application tracking, cover-letter drafts, and local CV extraction
- GitHub Actions runs ESLint, unit tests, and a production build on changes
- Supabase migration draft now enables RLS on job sources and jobs, exposing only active, unexpired jobs to authenticated users
- Initial Supabase SQL schema and RLS policies

## Not implemented yet
Candidate preferences, shortlist, and application statuses are saved only in browser local storage. CV bytes and extracted CV text are processed in the current browser page and are not uploaded or saved. Live search is read-only and uses Remotive's public API. Upstream data is cached for six hours, listings link back to Remotive, and results may be delayed by 24 hours. The source recommends no more than four upstream requests per day. This is not a broad all-market search. Cover letters are deterministic templates, not AI-generated text, and must be reviewed before use. PDF/DOCX/TXT text extraction is local; scanned/image-only PDFs do not get OCR. Skill suggestions use a fixed list and need candidate confirmation. The Supabase SQL file is a reviewed draft only and has not been applied to a project; verify policies and run it in a test project first. Automated CV section/profile inference, OCR, Supabase connection, Gmail OAuth, email sending, and scheduled automation are not active. Demo data remains available.

## Run locally
Requirements: Node.js 22.13+.

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
2. Add candidate-confirmed resume section parsing, and only consider OCR or cloud storage with separate consent and privacy controls.
3. Review Remotive's current API terms and add other authorized job source adapters with their own attribution and rate limits.
4. Add account-backed application history, duplicate prevention, and explicit user review before any submission.
5. Configure Gmail OAuth with least-privilege scopes and server-side token storage.
6. Test delivery with a dedicated mailbox before enabling automatic sending.

Never fabricate qualifications, bypass site controls, or send applications when required answers are unknown. The draft builder deliberately uses only the name, roles, and skills entered by the candidate. Treat job descriptions and inbound email as untrusted content.
