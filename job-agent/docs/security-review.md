# Job Agent — Security and launch checklist

Review date: 2026-10-21

This document records implemented controls and the remaining launch blockers. It is an implementation checklist, not an independent security audit.

## Implemented controls

- The public job feed is read-only. Listing text is treated as untrusted input, HTML is stripped before use, and provider URLs are constrained to expected HTTPS hosts and paths.
- Candidate profile data, shortlist entries, application notes, and application statuses are stored in browser local storage. The privacy control removes only the Job Agent-owned versioned keys after confirmation; previously exported CSV files are not erased.
- CV files and extracted CV text are processed in the browser and are not uploaded or included in the optional AI payload.
- AI cover-letter generation requires the owner-controlled `AI_COVER_LETTER_ENABLED=true`, a server-side `OPENAI_API_KEY`, and a client consent flag that is validated again on the server.
- The optional AI route forwards only a validated allowlist of candidate-entered fields and selected job details, supports Arabic or English output, with the selected language included in the explicitly consented request, uses `store: false`, and has a streaming request-body byte ceiling before buffering the full payload.
- CSV export quotes cells and neutralizes spreadsheet formula prefixes.
- ESLint, Vitest, and a production Next.js build run in GitHub Actions.

## Required before public launch

1. Add authentication and authorization before enabling the AI route or storing candidate records on a server.
2. Replace the in-memory per-process AI request counter with a shared, durable rate limiter and abuse monitoring.
3. Create a Supabase project, review the migration in a test project, verify all row-level security policies with separate user accounts, and run negative access tests. No migration is applied by this repository.
4. Add account-backed data export/deletion policies, retention rules, and privacy notices for any server-stored data.
5. Add a real secret manager and deployment-specific environment configuration. Never expose the OpenAI key or Supabase service-role key through a `NEXT_PUBLIC_*` variable.
6. Verify each job provider's current API terms, cache guidance, and attribution requirements before increasing request frequency or adding providers.
7. Keep applications and email sending disabled until Gmail OAuth least-privilege scopes, user review/approval, duplicate prevention, and delivery/audit logs are implemented and tested.

## Current limitations

The application is not deployed. Supabase and Gmail are not connected, job discovery is limited to the integrated public feeds, CV extraction is local and does not OCR image-only PDFs, and application tracking stays in the browser. The optional AI integration is disabled unless the deployment owner explicitly configures it.
