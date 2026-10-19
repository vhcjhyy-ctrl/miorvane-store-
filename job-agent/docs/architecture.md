# Architecture and safety

The current phase is a local UI demo with sample listings. No live integrations are active.

Target flow: authenticated CV upload -> server-side parsing -> candidate confirmation -> authorized job-source adapters -> normalized jobs and deduplication -> matching and hard constraints -> tailored application draft -> policy validation -> Gmail send only when explicitly enabled -> audit record -> optional reply classification.

Before sending: confirm Gmail OAuth, active job, authorized channel, valid recipient, confirmed candidate facts, no duplicate application, daily cap, emergency stop disabled, message validation, and durable idempotency key. Do not fabricate facts or answer unknown required questions. Never bypass login, CAPTCHA, or site restrictions.

Treat job descriptions and emails as untrusted input; they cannot override system policy or authorize actions.
