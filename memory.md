# BuildFlow AI — Project Memory

**Purpose:** Durable context for founders, contributors, and coding agents.  
**Last updated:** 2026-07-13  
**Update rule:** Keep this file concise, factual, dated, and consistent with the source documents.

## 1. Read order

Before making product or technical changes, read:

1. `memory.md` — current context and decisions.
2. `PRD.md` — users, scope, requirements, metrics, non-goals.
3. `phases.md` — what is authorized now and the exit gate.
4. `Architecture.MD` — system boundaries and stack.
5. `rules.md` — mandatory implementation rules.
6. `design.md` — UX, visual system, and product language.

If these documents disagree, stop and resolve the inconsistency rather than choosing silently.

## 2. Project in one paragraph

BuildFlow AI is an India-first construction operations product. Its initial wedge converts a site engineer’s voice update and photos into a structured, evidence-linked Daily Progress Report (DPR) that a project manager reviews and approves. The product is Android-first, offline-first, multi-tenant, and designed for English, Hindi, and Hinglish site reporting. The long-term ambition is an AI operating layer for construction, but expansion depends on earning trustworthy daily project data and paid adoption first.

## 3. Current phase

**Current engineering phase:** Phase A — foundation and migration (of the Phase A–F complete
MVP plan in `phases.md` §0, decided 2026-07-19).  
**Commercial phase:** Phase 0 — field discovery and design partners (unchanged; runs in
parallel and does not gate engineering).

The DPR vertical slice was built and audited first (2026-07-13 → 2026-07-19; see
`docs/GAP-ANALYSIS.md`): typecheck, 36 unit/integration tests, Playwright e2e, and the
production build all pass. Engineering now expands it into the complete MVP.

## 4. Current product decision

### Build now

- Voice/audio capture.
- Photo evidence capture.
- Offline local draft and reliable sync.
- Transcription and strict structured DPR extraction.
- Evidence-linked manager review.
- Approval, versioned PDF, and controlled sharing.
- Basic missing-report and blocker visibility.

### Explicitly defer

- Full ERP.
- Computer-vision progress percentage.
- Face attendance.
- Automated procurement, payment, scheduling, or compliance submission.
- Legally authoritative e-MB.
- Equipment maintenance.
- Budget forecasting.
- General portfolio chatbot.
- Neo4j/knowledge graph.
- Autonomous agents.

## 5. Current customer hypothesis

The initial ICP is a Delhi NCR contractor, EPC firm, or developer with 3–20 active projects whose site teams already report through WhatsApp, spreadsheets, Word, or PDFs. The likely buyer is a director or project head; the champion is a project manager; the primary contributor is a site engineer.

This is a hypothesis until Phase 0 evidence confirms which segment has the strongest pain, access, buying authority, and adoption behavior.

## 6. Current value proposition

> BuildFlow turns site voice notes and photos into accurate daily progress reports and management updates in minutes.

Do not lead early sales with “AI Operating System for Construction.” That language describes the long-term ambition and makes the immediate product sound broader than it is.

## 7. Current technical decisions

- Modular monolith plus asynchronous workers.
- TypeScript for web, mobile, API, and shared contracts.
- Python only for AI/document workers where it has a material ecosystem advantage.
- Next.js App Router for web.
- Expo React Native for the Android-first mobile app.
- SQLite/SQLCipher for offline drafts and sync commands.
- NestJS/Fastify for the API.
- PostgreSQL as the source of truth, including RLS, JSONB, `pgvector`, and PostGIS when needed.
- Managed Supabase services initially, subject to production region and contract confirmation.
- Cloud Run, Cloud Tasks, and object storage adapters for runtime and durable processing.
- OpenAI Responses API with Structured Outputs for the initial AI pipeline.
- Speech provider selected through a field benchmark across OpenAI, Sarvam, and Bhashini.
- HTML/CSS plus Playwright for issued PDF generation.
- No graph database, separate vector database, Kubernetes, Kafka, or agent framework in MVP.

## 8. Non-negotiable product boundaries

- The original audio, photo, and transcript remain available according to retention policy.
- AI output is a draft until an accountable human approves it.
- Unknown values remain unknown; AI must not invent convenient facts.
- Approved and issued report versions are auditable and immutable.
- Approval and external issuance are separate actions.
- Tenant/project authorization applies to every record, file, search result, job, export, and link.
- Offline capture must not lose acknowledged work.
- Regulatory and compliance output is review-ready assistance, never a guarantee.

## 9. Success definition

The north-star measure is **trusted approved project-days**.

Paid-beta targets:

- 70% or more of expected pilot DPRs submitted on time.
- Five minutes or less median contributor effort.
- 90% or more drafts accepted with minor or no correction by pilot end.
- Zero invented critical values in the release evaluation set.
- Three customers continue paying.
- One customer expands to another project.

## 10. Critical unknowns

1. Which customer segment buys fastest and retains best?
2. Which DPR fields are genuinely common across customers?
3. Can site users adopt a dedicated app, or is WhatsApp ingestion essential?
4. Which speech provider performs best on noisy, code-mixed field audio?
5. What level of correction makes a manager stop trusting the draft?
6. How much report-template customization is product versus services?
7. What retention and data-residency terms will paying customers require?
8. Which expansion workflow creates the highest retention or willingness to pay?
9. Are Delhi NCR compliance workflows a strong paid wedge after current legal validation?

## 11. Assumptions that must not become “facts”

- That millions of workers imply an accessible software market.
- That a site photo can yield a reliable completion percentage.
- That Neo4j is necessary for construction reasoning.
- That ₹2,999/month supports onboarding, storage, AI, and support costs.
- That a compliance workflow can be automated based only on public summaries.
- That an Indic-language model performs well in actual site noise.
- That users want chat instead of an exception-first workflow.
- That proprietary data automatically creates a defensible moat.

Each assumption requires a test, owner, and dated result.

## 12. Regulatory caution

The source roadmap discusses RERA, DPCC Dust Portal, GRAP, Measurement Books, Tally, and related processes. These requirements are time-sensitive, jurisdiction-specific, and may be incompletely or inaccurately summarized. Before designing, selling, or automating any such workflow:

1. verify current primary legal/regulatory sources;
2. consult a qualified domain professional;
3. version requirements by jurisdiction and effective date;
4. define accountable human review and submission;
5. avoid claims of guaranteed compliance.

## 13. AI memory and data policy

- This file stores project decisions, not customer data or personal memory.
- Never add production transcripts, photos, names, mobile numbers, invoices, secrets, tokens, or signed URLs.
- Eval examples live in controlled, consented, de-identified fixtures—not here.
- Model IDs belong in provider configuration and eval reports, not hard-coded throughout domain code.
- Derived AI artifacts inherit the source record’s access and deletion policy.

## 14. Decision log

### 2026-07-19 — Phase C landed: project controls

**What:** schedule items/milestones with baseline vs current dates and manual progress
(0–100, human-entered only); append-only `progress_update` history where cited evidence must
be an APPROVED report (drafts rejected); dependencies with same-project validation;
first-class blockers (severity/owner/due/resolution-note lifecycle, DPR back-links,
promote-from-extracted-blocker on approved reports); RFIs with per-project sequence numbers
+ append-only response threads with file uploads; drawing/document register with append-only
revisions and moving current pointer (old revisions auto-superseded); DPR↔schedule links
(evidence only — linking never moves a percentage); project overview with 7-day reporting
completeness, blocker rollup, 30-day milestones, and **explainable delay indicators** built
only from stored records (current-end overrun, baseline slip, open blockers, last approved
evidence — each named in the explanation).
**Migration:** 0006 (9 tables, FORCE RLS on all, rfi number + dependency + link uniques).
**UI:** ProjectNav tabs (Overview/Schedule/Blockers/RFIs/Documents/Settings) on new
`/projects/[id]` pages; report page gains schedule-link + blocker-tracking sections.
**Deferred:** schedule CSV import (Phase F polish), Gantt visualization (post-MVP),
RFI email notifications (Phase E).

### 2026-07-19 — Phase B (web + API) landed: trusted project record

**What:** `/v1` mobile sync API (idempotent manifest → checksum-verified uploads →
idempotent finalize; SYNCING report state; bearer sessions; RFC 9457 errors);
org/project administration (projects CRUD, settings, location hierarchy, activities,
CSV importers, member roles, hashed-token invitations with public accept + auto sign-in);
per-field review decisions (confirm/edit/remove/mark-unknown → new revisions + append-only
review trail, locked after approval); PROCESSING_FAILED retry + manual-draft fallback;
secure client links (hashed tokens, 30-day expiry, revocation, access audit, public
`/r/[token]` page + PDF stream); FTS search over approved reports only (GIN index,
tenant filter before ranking); photo evidence pages in issued PDFs (template v2).
**Conventions established (agents follow these):** queries in
`packages/db/src/queries/*` take `(db, ctx)` and filter by org; services in
`apps/web/src/core/*-core.ts` assertCan + audit; thin `"use server"` actions; migrations
via drizzle-kit + hand-appended FORCE-RLS policies; tests colocated, PGlite-backed.
**Deferred within B:** OpenAPI generation from contracts (Phase F), Hindi/Hinglish eval
fixtures (Phase F), invite delivery by email/WhatsApp (Phase E — link shown once to the
inviter for now), signed direct uploads (storage adapter swap).

### 2026-07-19 — Phase A landed: monorepo, auth, RLS, durable jobs, dual-driver Postgres

**What:** pnpm/Turborepo monorepo (`apps/web`, `apps/worker`, 8 packages); dev credential
auth (scrypt + hashed server-side sessions) behind `AuthPort`; RLS policies with
`buildflow_app` role + `withTenant` GUC helper, verified by hermetic tests; transactional
outbox + DB-backed job queue (lease/backoff/dead-letter) with the DPR pipeline as first
handler (`JOBS_MODE=inline` default, `worker` with real PG); dual-driver db client
(`DATABASE_URL` → node-postgres, else PGlite); CI + docker-compose + real-PG verification
script; PDF HTML escaping; strict `AI_PROVIDER`/`AUTH_PROVIDER` validation.
**Assumptions:** PGlite dev stays single-process (inline jobs); RLS wiring of every request
path through `withTenant` completes in Phase B with the application-service layer; Supabase
is the future managed path — a dev project exists (ref `ktbeunbbchszkskuesow`, Tokyo;
production must move to an India region), its URL/keys live only in `.env.local`, and
`SUPABASE_DATABASE_URL` is parked there until the switch (rename to `DATABASE_URL`).
**Deferred:** Supabase Auth adapter (Phase B/F), storage signed-URL adapter (Phase B),
Cloud Tasks dispatcher (Phase F), stuck-PROCESSING sweeper for dead jobs (Phase E dashboard).

### 2026-07-19 — Build the complete MVP on the audited slice

**Decision:** Expand the verified DPR vertical slice into the full MVP (13 scope areas,
Phases A–F in `phases.md` §0) instead of stopping at the wedge.  
**Reason:** Product direction set by the founder; the slice audit showed the domain core,
pipeline, review/issue flow, and tests are solid foundations to migrate incrementally.  
**Constraints preserved:** AI drafts / humans approve; immutable evidence and issued
versions; tenant isolation everywhere; no automated government submission, payments, or
biometrics; Measurement Book ships as “e-MB Preview” pending legal review.  
**Also:** `deisgn.md` renamed to `design.md`; all references updated.

### 2026-07-13 — Narrow initial wedge

**Decision:** Start with voice/photo-to-DPR rather than the full module roadmap.  
**Reason:** High-frequency pain, low behavior change, fast proof of value, and foundation for structured data.  
**Revisit when:** Three paid pilots reveal a different stronger workflow.

### 2026-07-13 — Modular monolith

**Decision:** One modular API deployable plus asynchronous workers.  
**Reason:** Faster iteration and simpler transactions; service boundaries are not yet proven.  
**Revisit when:** A measured scale, deployment, security, or ownership boundary justifies extraction.

### 2026-07-13 — PostgreSQL before graph

**Decision:** PostgreSQL is the transactional and search foundation; no Neo4j in MVP.  
**Reason:** Initial relationships and retrieval are well supported by relational tables, JSONB, full text, vectors, and recursive queries.  
**Revisit when:** Repeated production graph queries are demonstrably inadequate in PostgreSQL and a synchronized projection has a clear owner.

### 2026-07-13 — Offline-first Android

**Decision:** Expo/React Native with durable SQLite commands.  
**Reason:** Site connectivity and device conditions make network-dependent capture unacceptable.  
**Revisit when:** Field research shows a different primary device or workflow.

### 2026-07-13 — Human approval boundary

**Decision:** AI cannot approve or issue operational records.  
**Reason:** Trust, accountability, and the potential financial/compliance impact of construction records.  
**Revisit when:** Only through a separate product, legal, security, and customer-control decision.

### 2026-07-13 — Provider-portable AI

**Decision:** Use capability-based adapters and benchmark speech providers.  
**Reason:** Indic language, code-mixing, noise, accuracy, latency, and cost cannot be selected reliably from marketing claims.  
**Revisit when:** Field evaluation establishes a stable default or customer data-location requirements constrain providers.

## 15. Research log

### 2026-07-13 — Source roadmap reviewed

The provided “BuildFlow AI Startup Roadmap” was reviewed. Useful themes retained:

- unstructured-first input;
- site workflow ownership;
- daily reporting as a core foundation;
- India-specific language and operational reality;
- evidence accumulation for future modules.

Themes deliberately narrowed or deferred:

- ten-module simultaneous scope;
- early knowledge graph/Neo4j;
- precise AI vision progress measurement;
- autonomous agents;
- automated regulatory submission;
- low subscription pricing before unit economics.

### 2026-07-13 — Current stack guidance checked

Primary documentation reviewed for Next.js App Router, Expo SQLite/local-first design, Supabase PostgreSQL/RLS/extensions, OpenAI Structured Outputs/models/transcription, and Cloud Run autoscaling. Links are recorded in `Architecture.MD`.

## 16. Working experiment log

Use this structure for material experiments:

```text
Date:
Hypothesis:
Customer/user segment:
Method:
Sample:
Success threshold:
Result:
Decision:
Owner:
Follow-up date:
```

Do not record vague feedback such as “users liked it.” Record observed behavior, quantities, correction rates, payment commitments, and counter-evidence.

## 17. How to update this memory

Update `memory.md` when:

- the current phase changes;
- an assumption is validated or rejected;
- ICP, wedge, success metric, or scope changes;
- an architecture decision is accepted or reversed;
- a new material risk or constraint appears;
- field research changes product language or workflow.

For each change:

1. add the date;
2. state evidence, not just conclusion;
3. update the authoritative source document;
4. remove stale “current” statements;
5. retain a concise decision-log entry if the history matters.

## 18. Immediate next actions

1. Recruit three design partners in the defined ICP.
2. Schedule site shadowing and collect consented DPR/audio/photo examples.
3. Define and test the common DPR schema.
4. Prototype the mobile capture and manager review flows.
5. Run a concierge pilot before building the full processing platform.
6. Benchmark OpenAI, Sarvam, and Bhashini on real noisy site audio.
7. Measure current reporting time, correction severity, review latency, and willingness to pay.
