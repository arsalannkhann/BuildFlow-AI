# BuildFlow AI — Delivery Phases

**Status:** Execution roadmap  
**Last updated:** 2026-07-19  
**Planning principle:** Exit gates determine progress; calendar dates do not.

## 0. Engineering execution plan — complete MVP (decided 2026-07-19)

The DPR vertical slice passed its audit (`docs/GAP-ANALYSIS.md`). Engineering now executes
the complete MVP in six verified phases. The original go-to-market phases below (§Phase 0–9)
remain the commercial playbook; this section governs implementation order. For each phase:
migrations/contracts first, domain before presentation, authorization + audit with the
feature, tests at every level, type/test/build green before continuing, `memory.md` updated,
then continue automatically.

### Phase A — foundation and migration
Monorepo (pnpm workspaces + Turborepo): `apps/web`, `apps/mobile`, `apps/worker`,
`packages/{domain,db,contracts,ai,storage,jobs,testkit,ui-tokens}`. Preserve slice code and
tests. Real PostgreSQL (Docker) + PGlite test default behind one Drizzle layer; reviewed SQL
migrations; RLS policies; portable auth adapter (dev credentials + Supabase-ready);
expanded capability model (9 roles as bundles); transactional outbox + durable job port
(local DB-backed runner now, Cloud Tasks adapter later); signed-URL storage port; audit
everywhere; CI; one-command local stack.

### Phase B — trusted project record
Org/project setup (hierarchy, members, invitations, settings, CSV import), `/v1` REST API
with OpenAPI for mobile, offline-first Expo capture app (SQLite drafts, idempotent sync,
restart recovery), async DPR processing on the job runner, per-field review edits writing
revisions, retry/manual fallback, client-safe report links, photo pages in PDFs, search over
approved reports, full audit. Must be fully reliable before downstream modules consume DPR
facts.

### Phase C — project controls
Location hierarchy use, activities/milestones/schedule (baseline vs current), manual %
progress with evidence, dependencies, owners, first-class blockers, RFIs, drawing/document
register with revisions, DPR↔activity daily links, project overview, explainable delay
indicators from approved records only.

### Phase D — commercial operations
Materials catalogue/suppliers/receipts, invoice/challan OCR adapters + human review, stock
ledger + variance + shortage alerts, RFQs and human-approved PO drafts, labour attendance +
productivity, equipment register + reminders, Measurement Book (e-MB Preview) with
append-only certification flow, budgets/cost codes/EAC/variance, INR/GST formatting,
CSV/JSON exports.

### Phase E — intelligence and compliance — completed 2026-07-19
Portfolio exceptions dashboard, org/project-scoped search (FTS + `pgvector`), grounded
assistant (citations, approved-vs-draft distinction, refusal on insufficient evidence, no
mutations), notifications (in-app/email/WhatsApp adapters, preferences, delivery status),
compliance evidence packs (DPCC/GRAP/RERA) with checklists and versioned exports.

Exit gate passed: E1–E5 are implemented with capability enforcement, RLS migrations,
cross-tenant and grounding tests, immutable export checksums, typecheck, and production build.
Phase F is the active engineering phase.

### Phase F — production hardening
Localization (en/hi), accessibility (WCAG 2.2 AA), performance, observability, retention/
deletion/export, backup/restore documentation, onboarding + demo org with realistic Indian
construction data, threat model, runbooks, OpenTofu infrastructure definitions, security
review, remove placeholders, run all release gates and the 20 acceptance scenarios.

## 1. Operating model

The roadmap begins with field evidence, then a manually assisted workflow, then a narrow production system. Each phase has one primary risk to retire. The team does not begin the next phase because the previous sprint ended; it begins when the exit criteria are met.

### Program measures

- Trusted approved project-days.
- Contributor time per DPR.
- On-time submission rate.
- Draft correction severity.
- Critical AI error rate.
- Time from submission to review-ready.
- Manager review latency.
- Cost per approved DPR.
- Paid renewal and project expansion.

## Phase 0 — Field discovery and design partners

**Target duration:** Days 1–14  
**Primary risk:** The team is solving an imagined workflow.

### Objectives

- Select one initial customer profile.
- Observe the full DPR workflow on active sites.
- Collect representative, consented artifacts.
- Recruit three paid or committed design partners.
- Define the smallest common DPR schema.

### Work

- Shadow at least 10 site engineers across multiple working days.
- Interview project managers, directors, quantity surveyors, and billing/procurement staff.
- Observe connectivity, device, language, noise, glare, and time constraints.
- Collect anonymized DPRs, report templates, audio samples, photos, schedules, and correction examples with written permission.
- Measure current reporting time, delay, missing fields, and review behavior.
- Map the buyer, champion, contributor, reviewer, and recipient for each partner.
- Draft a pilot agreement covering data use, support, retention, success metrics, and non-production limitations.

### Deliverables

- Validated initial ICP.
- Three workflow maps.
- Common DPR schema v0.
- Field audio benchmark set.
- Consent and data-handling record.
- Three signed pilot intents or paid pilots.
- Updated PRD assumptions.

### Exit gate

- At least three companies provide real workflow access.
- At least two agree to pay if the defined outcome is achieved.
- A project manager confirms the proposed draft contains the minimum operational information.
- Site engineers can complete the proposed capture flow in a prototype usability test.

### Stop or pivot signal

If site teams do not submit repeatedly without founder chasing, change the workflow or customer segment before engineering the platform.

## Phase 1 — Concierge pilot

**Target duration:** Days 15–28  
**Primary risk:** The output is not trusted enough to review or pay for.

### Objectives

- Deliver the outcome manually before automating it.
- Learn correction patterns and report-template variation.
- Establish a quality baseline for transcription and extraction.

### Work

- Accept voice notes and photos through a controlled channel.
- Transcribe, structure, and prepare DPRs with human quality control.
- Return manager and client-safe summaries.
- Record every correction by field and reason.
- Measure turnaround, human effort, AI cost, and manager usage.
- Benchmark current OpenAI transcription against Sarvam and Bhashini using real site audio.
- Test willingness to pay at ₹10,000–₹25,000 per project for a four-week pilot.

### Deliverables

- At least 50 real project-day reports.
- Field-level quality baseline.
- Provider benchmark report.
- Top 20 correction/failure patterns.
- Report template v1.
- Pilot operating playbook.

### Exit gate

- Managers accept at least 80% of concierge reports with minor corrections.
- Median turnaround is below 30 minutes during the operating window.
- At least two partners pay or formally authorize the paid pilot.
- No unresolved critical ambiguity exists in who approves and who receives a report.

## Phase 2 — Product foundation

**Target duration:** Weeks 5–6  
**Primary risk:** The system cannot protect tenant data or recover from unreliable networks.

### Objectives

- Establish the repository, environments, domain model, auth, tenancy, storage, and observability.
- Build the mobile offline command foundation before rich UI.

### Workstreams

#### Platform

- Initialize pnpm/Turborepo monorepo.
- Configure TypeScript, Python, formatting, linting, tests, and pre-commit checks.
- Create local, preview, staging, and production configuration boundaries.
- Provision managed PostgreSQL, storage, Cloud Run, task queue, secrets, and observability through OpenTofu.

#### Identity and tenancy

- Authentication and session handling.
- Organizations, projects, memberships, and capabilities.
- PostgreSQL RLS and cross-tenant test suite.

#### Data and evidence

- Core report/evidence schema.
- Signed direct uploads and checksum verification.
- Audit event foundation.
- Data retention configuration skeleton.

#### Mobile reliability

- SQLite schema.
- Local draft and attachment manifest.
- Ordered idempotent sync command queue.
- Network recovery and process-death tests.

### Deliverables

- Deployable skeleton of web, mobile, API, and worker.
- One authenticated end-to-end tenant-scoped request.
- Local draft that survives app restart and syncs after reconnection.
- Threat model for tenant isolation and uploads.
- CI/CD and staging smoke test.

### Exit gate

- Cross-tenant negative suite passes.
- An acknowledged local draft survives app kill and network interruption.
- Repeat submission does not duplicate a report or attachment.
- Staging can be recreated from infrastructure and migration code.

## Phase 3 — Alpha: capture to review-ready DPR

**Target duration:** Weeks 7–10  
**Primary risk:** Automation is slower or less usable than the concierge workflow.

### Objectives

- Automate the complete field capture and manager review journey.
- Keep human operations available as a fallback.

### Workstreams

#### Mobile capture

- Project selection and report date.
- Voice recording, photo capture, and optional note.
- Local save, upload progress, retry, and status timeline.
- English/Hindi interface foundation.

#### AI pipeline

- Audio normalization and provider adapter.
- Transcription.
- Strict DPR extraction schema.
- Source references and deterministic validation.
- Processing state, retry, and manual fallback.

#### Manager review

- Review inbox.
- Draft/transcript/evidence comparison.
- Field edits, confirm/remove/unknown controls.
- Approval/rejection with audit trail.

#### DPR generation

- Versioned HTML template.
- Playwright PDF rendering.
- Immutable issued document.
- Secure internal sharing.

### Deliverables

- End-to-end alpha on staging and internal Android build.
- Prompt/schema version 1.
- Representative eval suite and report.
- Support runbook for upload and processing failures.

### Exit gate

- 90% of representative reports reach review-ready within three minutes after upload.
- No critical values are invented in the release eval set.
- A manager can create, correct, approve, issue, and retrieve a report without developer assistance.
- Offline/retry/idempotency and issued-version tests pass.
- Alpha meets the mobile usability benchmark on a representative low-end Android device.

## Phase 4 — Live design-partner pilot

**Target duration:** Weeks 11–14  
**Primary risk:** Real teams do not adopt the product consistently.

### Objectives

- Run the product on 3–5 live projects.
- Measure usage, trust, operational burden, and unit economics.
- Remove the founder from routine report preparation.

### Work

- Onboard project managers and site engineers in person.
- Configure real project templates and recipients.
- Add in-app and WhatsApp/email notifications.
- Instrument adoption and stage latency without collecting report content in analytics.
- Run weekly workflow reviews with each partner.
- Triage failures daily and classify product versus process issues.
- Measure support time per project and cost per approved report.

### Exit gate

- At least 70% of expected DPRs are submitted on time.
- Median contributor effort is at or below five minutes.
- At least 90% of reports are accepted with minor or no corrections by pilot end.
- At least three customers commit to continued paid use.
- At least one customer expands to a second project.
- No unresolved severity-1 privacy, isolation, data-loss, or approval defect exists.

### Failure response

- Low submission: investigate capture friction, incentives, report expectations, and champion behavior.
- High correction: narrow schema or improve provider/prompt/evidence review.
- Slow review: redesign the manager inbox and exception model.
- High support cost: simplify configuration and onboarding before adding features.

## Phase 5 — Paid beta and repeatable onboarding

**Target duration:** Months 4–6  
**Primary risk:** Each customer requires bespoke implementation.

### Objectives

- Turn pilot operations into a repeatable product.
- Establish commercial packaging and production controls.

### Work

- Self-serve organization/project setup with assisted onboarding option.
- Reusable DPR template system with bounded customization.
- CSV import for locations and activities.
- Billing, usage meters, plan entitlements, and invoice workflow.
- Administrative export, retention, and deletion.
- Operational SLOs, alerts, on-call ownership, backup restore drill.
- Security review and penetration test of critical surfaces.
- Customer-facing status and support process.
- Funnel reporting from invite to trusted project-day.

### Exit gate

- Five paying organizations or ten paying projects.
- Onboarding can complete in two business days without engineering work.
- Gross margin and support load support the proposed price.
- Renewal/expansion signals are positive.
- Restore, deletion, export, and incident runbooks have been exercised.

## Phase 6 — First expansion module

**Target duration:** Months 6–9  
**Primary risk:** Expansion dilutes the DPR wedge instead of increasing retention.

Select exactly one module based on pilot evidence.

### Option A — material document intelligence

Choose when material receipts, stockouts, or invoice reconciliation dominate customer pain.

- Challan/invoice capture.
- OCR and structured line items.
- Review workflow.
- Material receipt linked to project/day/report.
- Basic ordered/received/used variance.

### Option B — blocker and schedule intelligence

Choose when delay visibility dominates.

- Blocker owner and due date.
- Activity/location mapping.
- Daily unresolved blocker digest.
- Simple schedule import.
- Explainable delay signals from approved reports.

### Option C — Measurement Book workflow

Choose when contractor billing and measurement disputes dominate.

- Structured dimensions and calculations.
- Evidence links.
- Append-only correction model.
- Role-based verification and certification steps.
- Domain/legal review before describing the record as an authoritative e-MB.

### Exit gate

- The module is used weekly by existing paying customers.
- It increases retention, price, or project expansion.
- It does not reduce DPR reliability or adoption.

## Phase 7 — Portfolio intelligence and grounded assistant

**Earliest start:** After reliable approved data exists across multiple projects.

### Objectives

- Answer management questions from permission-filtered, approved evidence.
- Provide exceptions and trends without pretending uncertainty is fact.

### Scope

- Portfolio summary.
- Project comparison.
- Search across approved reports and evidence.
- Grounded Q&A with internal citations.
- Adoption, blocker, and report-latency trends.
- Role-aware response filtering.

### Exit gate

- Answers meet a documented factuality benchmark.
- Each material answer links to supporting records.
- Users can distinguish approved facts, drafts, calculations, and inferences.
- Query performance is adequate in PostgreSQL; otherwise evaluate projections through an ADR.

## Phase 8 — Compliance evidence packs

**Earliest start:** After current legal/domain requirements are independently verified.

### Potential scope

- RERA quarterly evidence preparation.
- DPCC/GRAP site evidence organization.
- Due-date tracking.
- Required-photo and metadata checklists.
- Review-ready draft reports and export packs.

### Hard boundaries

- No automated government submission in the first compliance release.
- No claim of guaranteed compliance.
- No reliance on AI vision alone as proof.
- Requirements are jurisdiction- and date-versioned.
- Qualified professionals approve all filings and certifications.

## Phase 9 — Advanced intelligence

This phase is a portfolio of hypotheses, not committed scope:

- forecasting of labour/material demand;
- visual safety assistance;
- progress estimation against schedule;
- procurement recommendations;
- budget-at-completion forecasting;
- equipment utilization;
- graph projections and construction ontology;
- customer-approved automation agents.

Each requires sufficient representative data, an evaluation framework, a human-control design, and a separate economic case.

## First 30-day calendar

### Week 1

- Confirm ICP and outreach list.
- Book site visits.
- Prepare consent, interview, and observation templates.
- Observe the first three DPR workflows.
- Collect initial audio and report samples.

### Week 2

- Complete interviews and workflow maps.
- Test a clickable capture/review prototype.
- Define DPR schema v0.
- Secure three design-partner commitments.
- Agree pilot metrics and price.

### Week 3

- Begin concierge reporting.
- Benchmark speech providers.
- Record correction taxonomy.
- Finalize architecture and data boundaries.
- Prepare repository and infrastructure plan.

### Week 4

- Complete at least 25 concierge reports.
- Review accuracy and unit cost.
- Decide whether to proceed, narrow the schema, or change ICP.
- If the exit gate passes, begin Phase 2 engineering.

## Staffing sequence

### Before product-market signal

- Founder/product lead with daily site exposure.
- One senior full-stack/mobile engineer.
- One AI/backend engineer or strong generalist.
- Contract construction-domain advisor.
- Part-time product designer/researcher.

### After paid-beta signal

- Customer implementation/success lead.
- Second product engineer.
- QA/automation ownership.
- Security/DevOps support as usage grows.

Do not build a computer-vision research team before the core reporting workflow has repeatable paid adoption.

## Decision cadence

### Daily during pilots

- Failed or missing reports.
- Data-loss or tenant/security signals.
- Processing stage failures.
- Critical correction examples.

### Weekly

- Adoption and review metrics.
- Customer feedback by role.
- Correction taxonomy.
- AI/provider cost and latency.
- Scope changes and experiment results.

### At each phase gate

- Proceed, repeat, narrow, pivot, or stop.
- Update `PRD.md`, `Architecture.MD`, and `memory.md`.
- Record irreversible technical decisions as ADRs.
- Remove experiments and flags that will not continue.

## Backlog policy

Every backlog item must include:

- user and problem;
- phase and priority;
- acceptance criteria;
- data/security implications;
- measurable outcome;
- dependencies;
- explicit exclusions.

Ideas without evidence remain in a discovery list, not the delivery backlog.
