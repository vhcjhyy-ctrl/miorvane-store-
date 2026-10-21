# Job Agent — Phase 14

A starter workspace for a personal AI job application agent. This folder is intentionally isolated from the existing store project.

## Current phase
- Next.js + TypeScript dashboard
- Candidate preferences form with explicit browser-local save/load (no cloud upload)
- Privacy control to clear only Job Agent-owned local storage keys, with confirmation and tests
- Browser-local text extraction for PDF, DOCX, and TXT, with size/page/character limits and reviewable skill suggestions
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
- Vitest suites for scoring, result filters/sorting, multi-source merge/deduplication, bounded request-body parsing, application dashboard summaries/status filtering, app-local data cleanup, Remotive and Arbeitnow normalization, browser-local shortlist, application tracking, CSV export, English/Arabic cover-letter drafts, and local CV extraction
- GitHub Actions runs ESLint, unit tests, and a production build on changes
- Supabase migration draft now enables RLS on job sources and jobs, exposing only active, unexpired jobs to authenticated users
- Initial Supabase SQL schema and RLS policies

## Not implemented yet
Candidate preferences, shortlist, application statuses, notes, and follow-up dates are saved only in browser local storage. The UI includes a confirmed cleanup action for the app-owned browser keys; it does not erase files exported earlier or data held by the hosting/provider logs. CV bytes and extracted CV text are processed in the current browser page and are not uploaded or saved. Live search is read-only and uses Remotive and Arbeitnow public APIs. Remotive results are cached for six hours and may be delayed by 24 hours; the source recommends no more than four upstream requests per day. Arbeitnow results are cached for one hour, link back to the provider, and focus mainly on Germany and nearby European markets. Both sources can contain stale, duplicated, or geographically restricted listings; this is not a complete all-market search. The local cover letter is a deterministic template. An optional server-side OpenAI Responses API draft is available in code but disabled by default; it sends only the explicitly consented name, role/skill fields, and selected job details, never CV bytes or extracted CV text. All generated text must be reviewed before use. PDF/DOCX/TXT text extraction is local; scanned/image-only PDFs do not get OCR. Skill suggestions use a fixed list and need candidate confirmation. The Supabase SQL file is a reviewed draft only and has not been applied to a project; verify policies and run it in a test project first. Automated CV section/profile inference, OCR, Supabase connection, Gmail OAuth, email sending, and scheduled automation are not active. Configure `OPENAI_API_KEY` server-side and set `AI_COVER_LETTER_ENABLED=true` only after adding authentication and a shared rate limiter; the included per-process limit is best-effort and not production-grade. Demo data remains available.

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
3. Review both active providers' current API terms and rate limits before adding additional authorized sources.
4. Add account-backed application history, duplicate prevention, and explicit user review before any submission.
5. Configure an authenticated deployment and shared rate limiter before enabling the optional AI route.
6. Configure Gmail OAuth with least-privilege scopes and server-side token storage.
7. Test any future email workflow with a dedicated mailbox before enabling sending.

Never fabricate qualifications, bypass site controls, or send applications when required answers are unknown. The draft builder deliberately uses only the name, roles, and skills entered by the candidate. Treat job descriptions and inbound email as untrusted content.
