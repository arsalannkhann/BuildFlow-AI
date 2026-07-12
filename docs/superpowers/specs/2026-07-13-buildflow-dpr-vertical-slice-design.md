# BuildFlow AI — DPR Vertical Slice Design

**Status:** Approved design (ready for implementation planning)
**Date:** 2026-07-13
**Author:** Founder + coding agent (brainstorming session)
**Source docs:** `PRD.md`, `Architecture.MD`, `phases.md`, `deisgn.md`, `rules.md`, `memory.md`

## 0. Context and intent

The project documents describe a full construction-operations MVP spanning four apps
(Next.js web, Expo mobile, NestJS API, Python AI worker) on Supabase/Cloud Run/OpenAI.
That is multiple independent subsystems and cannot be produced end-to-end, at the quality
bar in `rules.md` §22, in a single build.

This spec defines the **first vertical slice**: the thinnest end-to-end path through the
core Daily Progress Report (DPR) workflow that a person can actually run and demo, built on
the real architecture in miniature so it thickens phase by phase rather than being thrown
away.

**Explicit deviations from the source docs, made deliberately and approved by the founder:**

1. `memory.md` §3 / `rules.md` §2 place the project in Phase 0 (concierge pilot) and warn
   against full product implementation. The founder has chosen to build a runnable slice
   now. This spec honors that while keeping scope narrow.
2. Capture happens on **web** in this slice, not the Android-first Expo app. The offline
   Expo app remains the primary field surface and is a later workstream.
3. Code lives in a **single Next.js app** with hard internal boundaries, not the
   pnpm/Turborepo monorepo of `Architecture.MD` §6. Boundaries are designed so extraction
   into the monorepo is mechanical.
4. External services are **mocked by default**; the app runs with no accounts.

Everything else follows the source docs. Where this spec is silent, the source docs govern.

## 1. Goal — what "done" means

One runnable Next.js app in which a user can walk the entire core path in a browser:

> **Capture** (record a voice note in-browser + attach photos + optional text note) →
> **Process** (transcribe → extract a strict structured DPR with source references →
> deterministic validation → summaries) →
> **Review** (two-pane: editable structured fields left; transcript + audio player + photos
> right; edit / confirm / remove / mark-unknown) →
> **Approve** → **Issue** a versioned, immutable PDF →
> **Retrieve** it from a report timeline.

`pnpm dev` runs the whole thing — no external accounts, no Docker.

### Acceptance signals

- A site engineer (seeded user) can create a report with audio + photos and submit it.
- Processing produces a transcript and a schema-valid structured draft with `source_refs`,
  or surfaces a recoverable processing failure without losing inputs.
- A project manager (seeded user) can compare the draft to source evidence, edit fields
  (with edit history), approve, and issue a PDF.
- The issued PDF is versioned, immutable, and retrievable.
- No AI-produced critical value is invented; unknown fields are `null` / `Missing`.
- A cross-tenant access attempt fails closed (at least one automated test proves this).

## 2. Scope

### In scope

- Single seeded organization, single seeded project.
- Two seeded users: one **site engineer** (contributor), one **project manager** (reviewer).
- Dev login = choose a seeded user (no real auth provider yet).
- Web capture: browser microphone recording (`MediaRecorder`), photo file upload, optional
  short text note.
- Processing pipeline as discrete idempotent stages, run as a background job the UI polls.
- Strict versioned DPR extraction schema with `value` / `source_refs` / `confidence_band`.
- Manager review UI (two-pane), field editing with recorded revision history.
- Approval and issuance as **separate** actions.
- Versioned immutable PDF generation from approved data only.
- Report timeline / retrieval for the seeded project.
- Critical failure states: processing failure (inputs preserved, retry + manual fallback),
  rejection back to contributor with a reason.
- Minimal audit events for approve / issue / field edit.

### Out of scope (deferred; mapped to phases)

| Deferred item | Returns in |
|---|---|
| Expo mobile app + offline SQLite sync queue | Phase 2 / 3 |
| Real durable queue (Cloud Tasks), transactional outbox | Phase 2 |
| Full Postgres RLS + exhaustive cross-tenant negative suite | Phase 2 |
| Supabase Auth, real identity/session | Phase 2 |
| Dashboards, portfolio exceptions, search (`pgvector`) | Phase 3+ |
| WhatsApp / email delivery, secure public links | Phase 3 / 4 |
| Hindi / Hinglish support + field eval set | Phase 3 |
| Billing, usage meters, entitlements | Phase 5 |
| Real speech-provider benchmark (Sarvam/Bhashini) | Phase 1 / 3 |

The mock transcript is English only. Real Hindi/Hinglish is a provider-and-eval concern
handled in a later phase.

## 3. Architecture

Single Next.js (App Router) app. Hard internal module boundaries so the slice extracts into
the `Architecture.MD` §6 monorepo later without rewriting the domain.

```
src/
├── domain/       # framework-free. No React, no DB, no provider SDKs.
│   ├── report/       report state machine + transition guards
│   ├── dpr/          DPR schema types + Zod contracts + deterministic validators
│   ├── tenancy/      tenant context type, capability policy, authorization checks
│   └── ids/          UUIDv7 generation
├── db/           # Drizzle schema + typed queries. Postgres via PGlite locally.
│   ├── schema.ts
│   ├── client.ts     connection factory (PGlite now; Supabase/Postgres later)
│   ├── queries/      per-aggregate query modules, each requiring TenantContext
│   └── seed.ts
├── ai/           # provider ports + mock (default) + real OpenAI impls
│   ├── ports.ts      TranscriptionPort, ExtractionPort, SummaryPort
│   ├── mock/
│   ├── openai/       Responses API + Structured Outputs; selected by env
│   └── registry.ts   capability -> impl, chosen from config
├── storage/      # StoragePort: local filesystem now; S3/Supabase later
│   ├── port.ts
│   └── local-fs.ts
├── pipeline/     # discrete idempotent stages + a runner
│   ├── stages/       validateManifest, transcribe, extract, attachSourceRefs,
│   │                 validate, summarize, createRevision
│   └── run.ts        orchestrates stages against a processing_run
├── observability/ structured logging (IDs + state only, no customer narrative)
└── app/          # routes, server actions, React components
    ├── (contributor)/  capture flow
    ├── (manager)/      review inbox + report review + issuance
    └── api/            route handlers where server actions are insufficient
```

### Boundary rules (from `rules.md` §3)

- `domain/` imports nothing framework-specific. Pure functions and types.
- `app/` and `pipeline/` depend on `domain/`, `db/`, `ai/`, `storage/` — never the reverse.
- Provider-specific models never cross the `ai/` or `storage/` port boundary.
- No module reaches into another module's DB queries directly; go through its query module
  or a domain service.

### Runtime shape

- Server Components are the default; Client Components only for capture (mic/camera/upload)
  and review interactions (`rules.md` §5).
- The processing pipeline runs as a background job kicked off after upload finalization. The
  UI polls report status. This is an in-process stand-in for the real Cloud Tasks worker;
  stages are written to be idempotent and independently retryable so the port to a real
  queue is a lift-and-shift.

## 4. Data model

Postgres (via PGlite) with Drizzle. Every business row carries `organization_id`;
project-scoped rows also carry `project_id` (`rules.md` §7). IDs are opaque UUIDv7. Money is
not used in this slice; quantities are stored as **decimal value + normalized unit string**,
never floats. Timestamps stored UTC; project timezone stored separately.

### Tables

- `organization` — id, name, created_at.
- `user` — id, organization_id, display_name, role_hint (for dev login only).
- `membership` — id, organization_id, project_id (nullable = org-level), user_id,
  capabilities (text[]).
- `project` — id, organization_id, name, client_name, timezone, address, report_cutoff.
- `daily_report` — id, organization_id, project_id, report_date, status (enum),
  created_by, current_revision_id (nullable), created_at, updated_at.
- `report_revision` — id, organization_id, report_id, revision_number, structured_data
  (JSONB, schema-versioned), summary_internal, summary_client_safe, created_by, created_at,
  is_ai_generated (bool).
- `work_item` / `labour_entry` / `material_entry` / `blocker` — normalized projections of
  the current revision for querying/rendering. Source of truth for structured content is the
  revision JSONB; these are derived and rebuildable. (Rationale: keeps revision history
  simple while allowing relational queries later.)
- `attachment` — id, organization_id, project_id, report_id, kind (audio|photo),
  object_key (opaque), content_type, byte_size, checksum, captured_at (nullable), gps
  (nullable), created_at.
- `evidence_link` — id, organization_id, report_id, field_path (JSON pointer into
  structured_data), transcript_span (nullable), attachment_id (nullable).
- `processing_run` — id, organization_id, report_id, status, prompt_version, schema_version,
  provider, model, started_at, finished_at, error_category (nullable).
- `processing_stage` — id, processing_run_id, name, status, attempt, started_at,
  finished_at, error_category (nullable).
- `review_decision` — id, organization_id, report_id, revision_id, actor_id, decision
  (approve|reject|edit), reason (nullable), field_path (nullable), before_value (nullable),
  after_value (nullable), created_at.
- `issued_document` — id, organization_id, report_id, revision_id, version, object_key
  (PDF), document_id (stable public-facing), issued_by, issued_at, superseded_by (nullable),
  template_version.
- `audit_event` — id, organization_id, project_id (nullable), actor_id, action, subject_ref,
  created_at, metadata (JSONB, IDs/state only). Append-only.

### Report state machine (subset of `Architecture.MD` §8)

```
UPLOADED → PROCESSING → AWAITING_REVIEW → APPROVED → ISSUED
PROCESSING → PROCESSING_FAILED → PROCESSING            (retry)
PROCESSING_FAILED → AWAITING_REVIEW                    (manual draft fallback)
AWAITING_REVIEW → REJECTED → AWAITING_REVIEW
ISSUED → SUPERSEDED                                    (corrected issue)
```

Transitions are server-enforced by a pure guard function in `domain/report/`. `ISSUED`
content is immutable: a correction creates a new revision + a new `issued_document` and marks
the prior one superseded. Illegal transitions raise and are rejected.

## 5. AI pipeline and DPR schema

### Ports (`ai/ports.ts`)

- `TranscriptionPort.transcribe(audioRef) -> { text, segments[], language }`
  where each segment has `{ text, startMs, endMs }`.
- `ExtractionPort.extract(transcript, context) -> DprStructuredData` (schema-valid).
- `SummaryPort.summarize(structuredData) -> { internal, clientSafe }`.

Each port has a **mock impl (default)** and a **real OpenAI impl** (Responses API +
Structured Outputs). `registry.ts` maps capability classes (`speech.indic_field_audio`,
`extract.dpr_fast`, `reason.project_summary`) to an impl from config
(`AI_PROVIDER=mock|openai`). Provider models never leak past the port (`rules.md` §6, §11).

### DPR structured schema (Zod, versioned `schema_version`)

Matches `PRD.md` §8.3. Top-level fields:

- `work_items[]`: `{ description, location, activity, quantity: { value: string|null, unit:
  string|null }, source_refs, confidence_band }`
- `labour[]`: `{ trade, count: number|null, source_refs, confidence_band }`
- `materials[]`: `{ name, status: received|used|delayed|required|null, quantity, unit,
  source_refs, confidence_band }`
- `equipment[]`: `{ name, status: used|unavailable|null, source_refs, confidence_band }`
- `safety_quality[]`: `{ note, source_refs, confidence_band }`
- `blockers[]`: `{ description, cause, owner, expected_resolution, source_refs,
  confidence_band }`
- `weather_site_condition`: `{ value: string|null, source_refs, confidence_band }`
  (user-stated only)
- `tomorrow_plan[]`: `{ item, source_refs, confidence_band }`

Field contract (every value-bearing field):

- `value` present or explicitly `null` — **never invented** (`rules.md` §11).
- `source_refs`: array of `{ transcript_span?: {startMs,endMs}, attachment_id?: string }`.
- `confidence_band`: `Supported` (direct source) | `Check` (ambiguous/conflicting) |
  `Missing` (no support). No numeric percentages (`deisgn.md` §8).

The **mock extractor** returns a deterministic structured draft derived from a fixed canned
transcript, exercising every field type including some `Check` and `Missing` bands and at
least one `null`. This makes the whole flow demonstrable offline. `AI_PROVIDER=openai` + a
key switches to real extraction with the identical schema.

### Pipeline stages (`pipeline/stages/`, `Architecture.MD` §12)

1. `validateManifest` — confirm expected audio/photo objects exist and pass checksum.
2. `transcribe` — via `TranscriptionPort`; store transcript + segments.
3. `extract` — via `ExtractionPort`; **validate against Zod schema before persisting**.
4. `attachSourceRefs` — build `evidence_link` rows from `source_refs`.
5. `validate` — deterministic checks: units present where quantities exist, no impossible
   states, date sanity, duplicate detection. Conflicts set `confidence_band = Check`.
6. `summarize` — via `SummaryPort`; internal + client-safe summaries.
7. `createRevision` — write `report_revision`, set report `AWAITING_REVIEW`, emit audit +
   (stub) notification.

Rules: each stage idempotent and independently retryable; a provider refusal or malformed
result becomes a visible `PROCESSING_FAILED`, never an empty "successful" report; run stores
prompt/schema/provider/model version.

## 6. Review and approval

Manager review layout per `deisgn.md` §8:

- **Left pane:** structured DPR sections with editable fields. AI-drafted content visually
  distinct from confirmed content. Each field shows source badge, `confidence_band`, and
  edit/confirm/remove/mark-unknown controls.
- **Right pane:** transcript, audio player, photo rail. Selecting a field highlights its
  `transcript_span` and/or referenced photo.

Edits write a `review_decision` (actor, timestamp, field_path, before, after) and create a
new `report_revision`. **Approve and Issue are separate actions** (`deisgn.md` §8,
`memory.md` §8):

- **Approve** → status `APPROVED`, audit event. No external artifact yet.
- **Issue** → generate PDF, status `ISSUED`, `issued_document` row, audit event.
- **Request changes** → status `REJECTED` with a reason; returns to contributor.

Copy follows `deisgn.md` §18 (e.g. "2 items need confirmation", "No quantity was
mentioned"). Approval footer shows unresolved `Check`/`Missing` critical-item count.

## 7. PDF issuance

Playwright/Chromium renders an HTML/CSS A4 template (`deisgn.md` §17) from **approved data
only**. Output stored immutably via `StoragePort` (local filesystem). The `issued_document`
carries a stable `document_id`, `version`, issue time, approver identity, and
`template_version`. Client-safe rendering uses `summary_client_safe` and excludes internal
notes. A correction produces a new issued document and marks the prior `superseded_by`.

## 8. Tenancy and authorization (honest scoping)

Real app-layer enforcement in this slice:

- Every `db/queries/*` function requires an explicit `TenantContext { organizationId,
  projectId?, userId, capabilities }` (`rules.md` §7, §9). No query runs without it.
- `domain/tenancy/` provides capability checks (`report.approve`, `report.issue`,
  `report.create`, `report.review`). UI hiding is never authorization.
- `organization_id` from a request body is ignored for scope resolution; scope comes from
  the (dev) session (`rules.md` §8).
- At least one **cross-tenant negative test** proves a user of org A cannot read/act on an
  org B report — must fail closed.

**Deferred to Phase 2 (flagged so it is not forgotten):** Postgres Row-Level Security
policies, the exhaustive cross-tenant negative suite across every resource, and real
Supabase Auth. This slice does app-layer scoping + one representative isolation test; it does
**not** claim full defense-in-depth. This is a known, documented gap.

## 9. Key technical choices (and rejected alternatives)

- **PGlite (embedded Postgres) over Docker-Postgres or SQLite.** Real Postgres semantics
  (JSONB now, RLS later) with zero external dependency. SQLite would diverge from production;
  Docker adds friction to "runs today". Same Drizzle layer repoints at Supabase later.
- **In-process staged pipeline over a real queue.** Keeps the slice runnable; stages are
  idempotent/retryable so moving to Cloud Tasks is a lift-and-shift, not a rewrite.
- **Single Next.js app over the monorepo now.** Founder's choice; the `src/` boundaries make
  extraction into `apps/*` + `packages/*` mechanical.
- **Mock AI default, real OpenAI behind the same ports.** Flow is demonstrable with no keys;
  provider swap is a config change, honoring provider-portability (`memory.md` §7).

## 10. Testing (proportional to a slice, per `rules.md` §17)

- **Vitest (domain):** report state-machine transitions + illegal-transition rejection; DPR
  Zod schema validation (valid + malformed); tenant scoping helper; capability checks.
- **Vitest (pipeline):** each stage idempotent (running twice yields one result); a provider
  failure yields `PROCESSING_FAILED` with inputs preserved.
- **Vitest (security):** one cross-tenant negative test — org A user denied on org B report.
- **Playwright (e2e):** happy path capture → process (mock) → review → edit → approve →
  issue → retrieve PDF.

Not a full pyramid — that arrives with the Phase-2 foundation. These cover the slice's
highest-risk behaviors: state integrity, schema safety, tenant isolation, and the end-to-end
path.

## 11. Environment and running

- `pnpm dev` — runs the app with `AI_PROVIDER=mock` and PGlite; seeds org/project/users on
  first run.
- `pnpm test` — Vitest. `pnpm test:e2e` — Playwright.
- Config validated at startup; missing config fails with a specific, safe error
  (`rules.md` §15). Secrets never committed; `.env.example` documents keys with no values.
- To use real OpenAI: set `AI_PROVIDER=openai` and `OPENAI_API_KEY` in `.env.local`.

## 12. Definition of done for the slice

1. `pnpm dev` runs the full path end-to-end with no external accounts.
2. All tests in §10 pass.
3. No invented critical values in the mock path; unknowns are `null` / `Missing`.
4. Approve and Issue are distinct; issued PDF is versioned and immutable.
5. Processing failure preserves inputs and offers retry / manual fallback.
6. The cross-tenant negative test fails closed.
7. Deferred items (§2, §8) are recorded so later phases pick them up.
8. No secret, debug log of customer content, or dead flag remains (`rules.md` §22).
