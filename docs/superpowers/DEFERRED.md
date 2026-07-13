# Deferred from the DPR vertical slice

Tracked here so later phases (see `phases.md`) pick these up. Each is intentionally out of
the slice, not forgotten. The slice's job was one runnable end-to-end path on the real
architecture in miniature; these are the parts deliberately left for later.

## Deferred by design (from the spec, §2 / §8)

- **Postgres RLS + exhaustive cross-tenant suite** (Phase 2). The slice enforces tenant
  isolation at the application/query layer (every query requires a `TenantContext` and
  filters by `organization_id`) and ships one representative cross-tenant negative test
  (`src/security/cross-tenant.test.ts`). Full Row-Level Security policies and a per-resource
  negative suite are not yet in place — this is a known, documented gap, not defense-in-depth.
- **Expo mobile app + offline SQLite sync queue** (Phase 2/3). Capture is web-only here; the
  offline-first Android app (the primary field surface) is its own workstream.
- **Durable queue (Cloud Tasks) + transactional outbox** (Phase 2). The pipeline runs
  in-process; stages are written idempotently so they lift-and-shift onto a real worker.
- **Supabase Auth / real identity** (Phase 2). Dev "login" just picks a seeded user; there is
  no password, session table, or provider.
- **Dashboards, portfolio exceptions, search / `pgvector`** (Phase 3+).
- **WhatsApp / email delivery, secure revocable public links** (Phase 3/4).
- **Hindi / Hinglish support + field eval set + speech-provider benchmark**
  (Sarvam/Bhashini) (Phase 1/3). The mock transcript is English only.
- **Billing / usage meters / entitlements** (Phase 5).

## Fast-follows within the DPR product (Phase 3)

- **Inline per-field editing that writes new revisions.** The review UI currently shows
  confidence bands + evidence and drives approve/issue; it does not yet persist field-level
  edits (confirm / correct / remove / mark-unknown → new revision). This is the `deisgn.md`
  §8 edit-controls behavior, deferred from the slice.
- **Evidence-link rows.** Source references currently live inside the revision's
  `structured_data` JSONB and are rendered from there. The `evidence_link` table exists but
  is not populated; a dedicated stage can materialize it if relational queries over evidence
  are needed.
- **Photo embedding + multi-page pagination in the issued PDF.** The A4 template renders the
  structured sections; selected photo evidence and pagination controls (`deisgn.md` §17) are
  not yet included.

## Hardening notes (do before ingesting less-trusted input)

- **HTML-escape interpolated values in the PDF template** (`src/pdf/template.ts`). The
  template interpolates DPR field text and summaries directly into an HTML string that is fed
  to a throwaway headless Chromium page. Data comes from the internal approved record today,
  so this isn't user-facing XSS, but per `rules.md` §13 ("sanitize rendered HTML") the
  interpolated strings should be escaped before this pipeline ingests transcripts from
  less-trusted sources.
- **Concurrency-safe revision numbering.** `addRevision` computes `revisionNumber` as
  count+1 (read-then-insert), which is safe for the single-writer slice but should become a
  DB sequence / unique constraint before concurrent writers (e.g. simultaneous AI processing
  and manual edits) exist.
- **`AI_PROVIDER` typo handling.** An unrecognized `AI_PROVIDER` value silently falls back to
  the mock provider; consider failing loudly on an unknown value once more providers exist.

## Environment note (not a product gap)

- The Playwright e2e injects a synthesized audio stream because this macOS host gates
  microphone access for the headless Chrome-for-Testing binary in non-interactive runs. The
  full capture → upload → pipeline path still runs for real; on Linux CI the OS gate does not
  apply and Chromium's fake audio device can be used instead.
