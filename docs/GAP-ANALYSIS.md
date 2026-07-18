# BuildFlow AI — Gap analysis: DPR vertical slice → complete MVP

**Date:** 2026-07-19
**Audit basis:** commit `0876c6c` (clean tree). `pnpm typecheck` ✅, `pnpm test` 36/36 ✅, `pnpm build` ✅.

## 1. What exists today (verified working)

A single Next.js 15 (App Router) application implementing the DPR vertical slice end to end,
with hard internal boundaries designed for later extraction:

| Area | Implementation | Status |
|---|---|---|
| Domain | `src/domain` — report state machine (8 states, server-enforced transitions), strict versioned DPR Zod schema (`dpr.v1`) with `source_refs` + `confidence_band` per claim, deterministic validators, capability-based tenancy (`TenantContext`, 4 capabilities), UUIDv7 ids | Working, tested |
| Database | Drizzle over embedded PGlite; 13 tables (org, user, project, membership, daily_report, report_revision, attachment, evidence_link, processing_run, processing_stage, review_decision, issued_document, audit_event); every business table carries `organization_id`; every query requires explicit `TenantContext` | Working, tested |
| AI | Ports (`TranscriptionPort`, `ExtractionPort`, `SummaryPort`) with deterministic mock default and OpenAI implementation; registry selected by `AI_PROVIDER`; central `dprSchema.parse` gate so malformed provider output → visible `PROCESSING_FAILED` | Working, tested |
| Storage | `StoragePort` (put/get/exists + checksum) with local-FS implementation; opaque object keys under `org/<id>/report/<id>/…` | Working, tested |
| Pipeline | `src/pipeline/run.ts` — validate manifest → transcribe → extract → validate → summarize → create revision; per-stage records, idempotent retry, failure taxonomy; runs in-process (synchronously inside the capture server action) | Working, tested |
| Review | Approve / request-changes / issue as separate capability-gated actions; append-only `review_decision` + `audit_event`; issued PDFs versioned + immutable + supersession link | Working, tested |
| PDF | HTML template → Playwright/Chromium render; template version recorded | Working, tested |
| Web UI | Login (seeded users), capture (MediaRecorder voice + photos), reports list, review screen with transcript/evidence/confidence bands, PDF download | Working, e2e-tested |
| Security tests | One representative cross-tenant negative test; capability denial tests | Present |

## 2. Dev-only stand-ins that must become production-capable (Phase A)

| Today | MVP requirement |
|---|---|
| PGlite embedded Postgres | Real PostgreSQL (Docker local / managed in prod) behind the same Drizzle layer, with reviewed SQL migrations and RLS |
| Cookie picks a seeded user; no credentials | Real authentication (portable auth adapter; Supabase Auth in prod), sessions, invitations |
| App-layer tenancy only | + PostgreSQL RLS defense-in-depth and per-resource cross-tenant negative suite |
| Local-FS storage, server-proxied uploads | Storage port with signed direct upload + signed short-lived read URLs; local emulator for dev |
| Synchronous in-process pipeline | Transactional outbox + durable job runner (local adapter now, Cloud Tasks adapter for prod); independently retryable stages |
| Single Next.js app | pnpm workspaces + Turborepo monorepo: `apps/web`, `apps/mobile`, `apps/worker`, `packages/*` |
| No CI | CI (typecheck, unit/integration, build, e2e) + one-command local stack |

## 3. Scope-area gap map

Legend: ✅ exists · 🟡 partial · ❌ missing

| # | MVP scope area | Status | Existing assets to preserve | Gap |
|---|---|---|---|---|
| 1 | Organizations, projects, access | 🟡 | org/project/membership tables, capability model | Org settings, multi-project, location hierarchy (site→room), 9 roles as capability bundles, per-project roles, invitations, project settings (tz/coords/cutoff/recipients), CSV import, strict isolation on every new query |
| 2 | Offline-first field app | ❌ | Web capture flow as reference; REST-able server actions | Entire Expo app: auth, Today screen, recorder (pause/resume/playback), photo/gallery, SQLite drafts + sync commands, resumable idempotent uploads, restart recovery, en/hi, offline states |
| 3 | Daily Progress Reports | 🟡 | Whole slice: schema, pipeline, review, approve/issue, immutable PDFs | Hindi/Hinglish transcription fixtures, per-field edit actions writing revisions (confirm/edit/remove/mark-unknown), contradiction highlighting, client-safe links, superseding corrections UI, photo pages in PDF, retry/manual-fallback UI, async processing |
| 4 | Project controls | ❌ | blockers exist inside DPR JSON | Activities/milestones/schedule tables, baseline vs current, % progress with evidence, dependencies, blockers as first-class records, RFIs, drawing register + revisions, DPR↔activity links, overview, delay indicators |
| 5 | Measurement Book | ❌ | append-only revision pattern to reuse | Full e-MB Preview module: dimensions, deterministic quantity calc, states draft→submitted→verified/rejected→certified, append-only corrections, geotagged evidence, MB register + RA-bill export |
| 6 | Materials, invoices, procurement | ❌ | attachment/evidence infrastructure; OCR port pattern | Catalogue, units, suppliers, challan receipt flow, OCR adapter + review, stock ledger, variance, shortage alerts, RFQ/PO-draft approval, Tally-suitable export |
| 7 | Labour and equipment | 🟡 | labour array inside DPR JSON | First-class trades/contractors/attendance, GPS check-in (no biometrics), productivity vs approved quantities, equipment register/assignment/usage/fuel/downtime/service reminders |
| 8 | Budget and cost | ❌ | integer-minor-unit rule in rules.md | Budgets + versions, cost codes/lines, committed/invoiced/paid/forecast, invoice linkage, EAC (deterministic), variance explanations, INR/GST formatting, CSV export |
| 9 | Portfolio dashboard | ❌ | report status data | Exception-first executive dashboard, all metrics linking to source records |
| 10 | Search + grounded assistant | ❌ | transcripts/revisions stored queryably | Postgres FTS + pgvector projections, permission-filtered search API + UI, grounded Q&A with citations/refusal, no-mutation guarantee |
| 11 | Compliance evidence packs | ❌ | evidence + audit foundations | Requirement checklists (DPCC/GRAP/RERA), owners/due dates, missing-evidence warnings, versioned PDF/ZIP exports, review status, draft labeling |
| 12 | Notifications + sharing | ❌ | — | In-app notifications, email adapter, WhatsApp mock adapter, events, preferences, delivery status/retries, secure expiring client links |
| 13 | Admin + commercial | ❌ | audit_event table | Org/project admin UI, usage meters, entitlements (Starter/Pro/Enterprise), manual billing state, export/retention/deletion, audit-log viewer, provider-health dashboard, demo org seed, onboarding + CSV templates |

## 4. Cross-cutting gaps

- **Contracts/OpenAPI:** no `/v1` REST API yet (mobile needs one); Zod→OpenAPI generation missing.
- **Observability:** no structured logging/tracing conventions yet.
- **Hardening (from DEFERRED.md):** HTML-escape PDF template interpolation; DB-enforced revision numbering; fail loudly on unknown `AI_PROVIDER`.
- **Infra:** no Docker compose, no OpenTofu definitions, no threat model, no runbooks.
- **Evaluation suite:** en/hi/Hinglish + construction-term fixtures missing.

## 5. Migration decision

Preserve the slice and migrate incrementally (per brief): the domain/db/ai/storage/pipeline
code moves into workspace packages essentially unchanged; the Next.js app becomes
`apps/web`; the in-process pipeline becomes a job handler behind a durable-queue port; PGlite
remains the zero-dependency test/dev default while real Postgres (Docker) becomes the
supported production path. Significant stack deviations from `Architecture.MD` are recorded
as ADRs in `docs/adr/`.
