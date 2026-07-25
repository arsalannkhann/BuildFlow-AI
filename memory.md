# BuildFlow AI — Project Memory

**Purpose:** Durable context for founders, contributors, and coding agents.  
**Last updated:** 2026-07-19
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

**Current engineering phase:** Phase F implementation complete; MVP release candidate
awaiting environment-owned deployment gates and second review. Phases A–E are complete.
**Commercial phase:** Phase 0 — field discovery and design partners (unchanged; runs in
parallel and does not gate engineering).

The DPR vertical slice was built and audited first (2026-07-13 → 2026-07-19; see
`docs/GAP-ANALYSIS.md`), then expanded through project controls, commercial operations,
notifications, portfolio/search, a cited read-only assistant, and compliance evidence packs.
The repository-wide candidate covers 164 unit/integration tests plus four Playwright
journeys, a production build, secret scanning and 15 package typechecks.

### Open Phase F gates / explicit local waivers

- **F-W1 — real PostgreSQL:** not run locally because Docker Desktop and a local PostgreSQL
  service are unavailable. CI or a Docker-enabled machine must apply migrations 0000→0011
  and verify FORCE RLS before deployment.
- **F-W2 — live Supabase Storage:** not run because no approved India-region bucket is
  configured. Adapter contract tests pass; staging must verify signed upload/download,
  expiry, scope, export-link audit and cleanup using synthetic data.
- **Review:** migration 0011, RLS, auth/registration, retention and deletion changes require
  a second qualified reviewer before merge or deployment (`rules.md`).

These are recorded constraints, not passing results. Exact commands are in
`docs/RELEASE-EVIDENCE.md`.

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
- Automated procurement, payment, scheduling, or government compliance submission.
- Legally authoritative e-MB.
- Predictive equipment maintenance or budget forecasting.
- An uncited general-purpose portfolio chatbot.
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
- Next.js App Router for web.
- Expo React Native for the Android-first mobile app.
- SQLite for offline drafts and idempotent sync commands; SQLCipher remains a production
  mobile-build validation item.
- Next.js route handlers/server actions provide the modular `/api/v1` API (ADR-0001).
- PostgreSQL as the source of truth, including RLS, JSONB, `pgvector`, and PostGIS when needed.
- Managed PostgreSQL and private Supabase Storage are the initial deployment targets,
  subject to India-region and contract confirmation; local mode uses PGlite/local FS.
- A transactional database queue is the MVP durable runner; Cloud Tasks remains an adapter
  option after measured need (ADR-0003).
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

### 2026-07-26 — Verifiable citations + DPR document rebuild (Tier 1)

**Voice model of record:** transcription is `gemini-2.5-flash` on Vertex AI with audio passed
as inline base64 — NOT Google Speech-to-Text. Consequence: `transcript_span` start/end
offsets are model-generated tokens, not waveform measurements, so they are a navigation hint
only. Real word timings need an ASR provider (Chirp 2 candidate; verify `asia-south1`
availability and Hinglish quality against a benchmark set before switching).

**What landed:**
- `sourceRef.quote` (optional, so `dpr.v1` stays readable for every historical revision;
  the behavioural change is carried by prompt version `dpr-extraction.v2`).
- `verifyQuoteAnchors()` checks each quote really occurs in the transcript
  (whitespace/case/smart-punctuation tolerant, ≥3 chars). A fabricated or unverifiable
  citation is REMOVED and its item drops `Supported → Check`; the claim itself survives.
- Review UI shows "Cited words from the recording", or an explicit warning when nothing
  verifiable supports an item. `equipment` and `safety_quality` are now reviewable at all.
- Issued PDF rebuilt (`dpr-pdf.v3`): renders `weather_site_condition`, `safety_quality` and
  `equipment` — all three were extracted, reviewed, then silently DROPPED by v2 — plus
  quantity/labour/material/equipment/blocker tables with repeating headers, labour total,
  per-project `DPR No.` serial (migration 0015, unique per project), project/client/site
  identity, submitted-by / approved-by / client-signature block, Check-flag markers, page
  numbering, and a SUPERSEDED banner.
- Demo seed now stores a transcript and cites it, so demo data demonstrates evidence-linked
  review; `cite()` throws at seed time if a citation is not in its transcript.

**Known pre-existing failure (NOT from this change):** `e2e/dpr-flow` fails at
`AWAITING_REVIEW` because the inline job drain (`JOBS_MODE=inline`) leases nothing inside
the Next dev server, so a submitted report stays `PROCESSING`. Verified by stashing this
work and reproducing on clean HEAD. The job runner itself is correct (unit tests pass, and a
standalone process drains the same queued job successfully). Production is unaffected: it
runs `JOBS_MODE=worker` with a dedicated worker container. Root cause still open — suspect
PGlite single-connection interaction with `FOR UPDATE SKIP LOCKED`. Fix before relying on
inline mode anywhere.

**Local dev footgun found:** running a `tsx` script against `.pglite` while `pnpm dev` is
running corrupts the data directory (two PGlite processes, one dir). Recover with
`rm -rf .pglite && pnpm seed:demo`.


### 2026-07-19 — Phase F landed as an engineering release candidate

**Product readiness:** opt-in, rate-limited organization registration atomically creates the
tenant, owner membership, credential and audit event; onboarding creates the first project,
invites a teammate and supplies location/activity templates. Starter/Professional/Enterprise
entitlements and manual billing state share one policy module; live org meters cover projects,
users, stored evidence and AI runs; `pnpm seed:demo` creates a synthetic two-project,
14-day Indian construction dataset.

**Security and operations:** production no longer seeds public demo credentials implicitly;
demo role cards disappear outside demo mode; auth/public/API/upload rate and size limits use
database counters with hashed keys. API requests and jobs carry trace-safe structured logs;
stuck processing is failed safely; dead jobs/provider aggregates are visible on the owner
health page. Migration 0011 adds lifecycle/commercial state, FORCE RLS and immutable audit/
deletion controls. The threat model, SLO, incident, restore and data-lifecycle runbooks are
current.

**Lifecycle and storage:** local and Supabase storage adapters implement immutable puts,
list/delete and short-lived signed access. Owners can request audited ZIP exports. Daily
retention removes expired evidence and inherited transcripts/summaries/search derivatives.
Deletion requires a distinct second owner, a seven-day grace period and a signed content-free
receipt.

**Quality:** project-timezone formatting, Hindi catalog verification, responsive onboarding,
automated WCAG A/AA scans, keyboard access, 320px reflow and navigation dead-link audits are
release gates. OpenAPI 3.1 and API usage docs are published. Local verification covers 63
test files / 164 tests, production build and four browser journeys. F-W1/F-W2 and second
review remain open; therefore the candidate is not yet approved for customer deployment.

### 2026-07-19 — Phase E landed: intelligence, notifications, and compliance evidence

**What:** E1 notification event catalog, recipient resolution, in-app inbox/bell,
email/WhatsApp provider ports, delivery retry/dead-letter status, and per-user preferences;
E2 exception-first portfolio rollups; E3 rebuildable search projection with tenant filtering
before lexical/semantic ranking and explicit working-vs-approved labels; E4 read-only project
assistant with deterministic SQL answers for canonical operational questions, permission-
filtered grounded fallback, a versioned injection-resistant prompt, strict structured output,
server-revalidated citations, and an insufficient-evidence refusal; E5 operational compliance
evidence packs for dust controls, GRAP readiness, quarterly updates, and custom workflows.
**Compliance boundary:** template wording is jurisdiction-neutral and carries a legal caution;
requirements accept only approved/certified same-project evidence (or an explicit note/N/A
reason); submission locks the checklist for `compliance.review`; exports are immutable,
checksum-addressed ZIP versions containing a manifest, CSV, DRAFT/REVIEWED cover PDF, and
source evidence. BuildFlow does not submit to a government portal or guarantee compliance.
**Migrations:** 0008 notifications, 0009 search/pgvector, 0010 compliance packs/requirements/
exports with FORCE RLS and immutable version uniqueness.
**UI:** `/portfolio`, `/search`, `/assistant`, `/notifications`, account preferences, and
project compliance register/detail/download routes; assistant and compliance surfaces are
responsive, source-forward, and explicit about read-only/draft states.
**Verification:** 50 test files / 146 tests, cross-tenant denials, typecheck, and production
build pass. Phase F production hardening is next.

### 2026-07-19 — Phase D landed: commercial operations

**What:** materials catalogue + suppliers + challan receipts with OCR review queue and an
append-only stock ledger (posting a reviewed receipt applies stock exactly once via a
partial unique on ledger source refs; deterministic shortage alerts on the overview);
invoices (OCR draft → human review → approval posts cost entries exactly once), cost
codes, immutable budget versions with CSV import, committed/invoiced/paid rollups, and
deterministic EAC with the formula string shown beside every figure (INR paise +
Indian-grouped `formatINR`); labour contractors + daily attendance TOTALS (no individual
identities) with a deterministic productivity join vs approved-DPR quantities; equipment
register/assignments/append-only logs + rule-named service reminders (due-date window OR
cumulative hours); Measurement Book (e-MB Preview) with server-computed quantities
(`packages/domain/src/mb/calc.ts`, mismatches refused), draft→submitted→verified|rejected→
certified gates (`mb.create/verify/certify`), append-only corrections
(corrects_entry_id/superseded_by), geotagged evidence, MB-register + RA-bill CSVs; RFQ →
manual quotes → comparison → PO draft → approved (`procurement.approve`) → manual CSV/JSON
export for later Tally import — POs are never sent automatically.
**OCR:** `DocumentExtractionPort` (extractChallan/extractInvoice) in packages/ai with
zod-versioned `challan.v1`/`invoice.v1` (per-field confidence bands, null when unsupported),
deterministic mock + OpenAI vision behind `AI_PROVIDER`; `document.extract` job lands DRAFT
lines only — nothing touches stock or costs before a capability-gated human acts.
**Migration:** 0007 (26 tables, FORCE RLS on all, exactly-once partial uniques on
stock/cost source refs, per-project sequence uniques for MB and PO numbers).
**UI:** ProjectNav gains Materials/Procurement/Labour/Equipment/Measurement Book (e-MB
Preview)/Budget tabs; every metric links to its source records.
**Deferred:** DPR material/labour/equipment auto-suggest into ledgers (Phase F), invoice↔
receipt three-way match (post-MVP), PO PDF layout (Phase F), cost-entry kinds labour/
equipment from attendance/logs (recorded manually for now).

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

1. Obtain the mandatory second review of migration 0011, RLS, registration and lifecycle code.
2. Run F-W1 on disposable real PostgreSQL and attach the successful CI/terminal evidence.
3. Provision an approved India-region private Supabase bucket and complete F-W2 in staging.
4. Exercise offline capture/restart/reconnect on a representative low-end Android device.
5. Recruit three design partners and run consented site shadowing with synthetic data removed.
6. Benchmark OpenAI, Sarvam and Bhashini on approved noisy field audio.
7. Measure reporting effort, correction severity, review latency, paid intent and expansion.
