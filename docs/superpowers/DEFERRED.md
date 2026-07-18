# Deferred from the DPR vertical slice

Tracked here so later phases (see `phases.md`) pick these up. Each is intentionally out of
the slice, not forgotten. The slice's job was one runnable end-to-end path on the real
architecture in miniature; these are the parts deliberately left for later.

## Status update (2026-07-19, Phase A)

Landed since this list was written: RLS policies + hermetic enforcement tests
(`packages/db/drizzle/0002_rls_defense_in_depth.sql`, `packages/db/src/security/rls.test.ts`);
transactional outbox + DB-backed durable queue with worker (`packages/jobs`, `apps/worker`);
credentialed sessions behind `AuthPort` (`packages/auth`); asynchronous-capable processing
(`JOBS_MODE`); PDF HTML escaping; strict `AI_PROVIDER` validation; DB-enforced revision/issue
uniqueness. Still open from the original list, now tracked for Phases B–F:

- **Per-resource cross-tenant negative suite** and wiring every request path through
  `withTenant` RLS GUC (Phase B, with the application-service layer).
- **Expo mobile app + offline SQLite sync queue** (Phase B).
- **Cloud Tasks dispatcher** on top of the outbox (Phase F).
- **Supabase Auth adapter** behind `AuthPort` (Phase B/F).
- **Dashboards, portfolio exceptions, search / `pgvector`** (Phase 3+).
- **WhatsApp / email delivery, secure revocable public links** (Phase 3/4).
- **Hindi / Hinglish support + field eval set + speech-provider benchmark**
  (Sarvam/Bhashini) (Phase 1/3). The mock transcript is English only.
- **Billing / usage meters / entitlements** (Phase 5).

## Fast-follows within the DPR product (Phase 3)

- **Inline per-field editing that writes new revisions.** The review UI currently shows
  confidence bands + evidence and drives approve/issue; it does not yet persist field-level
  edits (confirm / correct / remove / mark-unknown → new revision). This is the `design.md`
  §8 edit-controls behavior, deferred from the slice.
- **Evidence-link rows.** Source references currently live inside the revision's
  `structured_data` JSONB and are rendered from there. The `evidence_link` table exists but
  is not populated; a dedicated stage can materialize it if relational queries over evidence
  are needed.
- **Photo embedding + multi-page pagination in the issued PDF.** The A4 template renders the
  structured sections; selected photo evidence and pagination controls (`design.md` §17) are
  not yet included.
- **Retry / manual-fallback UI for `PROCESSING_FAILED`.** Inputs are preserved and the state
  machine allows `PROCESSING_FAILED → PROCESSING` (retry) and `→ AWAITING_REVIEW` (manual
  draft), but no action/UI wires it yet. Wire before real providers are the default (Phase B).
- ~~Asynchronous processing~~ — done in Phase A: capture enqueues a `report.process` job in
  the same transaction; `JOBS_MODE=worker` runs it on `apps/worker`, inline mode preserves
  the single-process PGlite dev flow; the report page auto-refreshes while processing.
- **Stuck-PROCESSING sweeper.** A job that dead-letters leaves its report in `PROCESSING`;
  the provider-health dashboard (Phase E) must surface dead jobs and offer retry.

## Hardening notes (do before ingesting less-trusted input)

- ~~HTML-escape interpolated values in the PDF template~~ — done in Phase A (`esc()` in
  `packages/pdf/src/template.ts`).
- **Concurrency-safe revision numbering.** A unique index on
  `(report_id, revision_number)` now makes collisions fail loudly (migration 0002); the
  read-then-insert in `addRevision` still needs retry-on-conflict once concurrent writers
  exist (Phase B review edits).
- ~~`AI_PROVIDER` typo handling~~ — done in Phase A: unknown values throw.

## Environment note (not a product gap)

- The Playwright e2e injects a synthesized audio stream because this macOS host gates
  microphone access for the headless Chrome-for-Testing binary in non-interactive runs. The
  full capture → upload → pipeline path still runs for real; on Linux CI the OS gate does not
  apply and Chromium's fake audio device can be used instead.
