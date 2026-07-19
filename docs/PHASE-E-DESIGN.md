# Phase E design — intelligence, notifications, compliance

**Date:** 2026-07-19 · Working design for portfolio dashboard, search + grounded assistant,
notifications, and compliance evidence packs. Follows the conventions in memory.md §14 and
rules.md §11 (AI), §14 (privacy), §16 (observability).

## Notifications and external sharing

- `notification` — org, recipient_user_id, event_kind, subject_ref (entity id), title, body
  (NO customer report narrative — titles reference records, bodies stay operational),
  read_at?, created_at.
- `notification_delivery` — notification_id, channel: email|whatsapp, status:
  queued|sent|failed|dead, attempts, last_error, provider_message_id?, updated_at.
  Delivery runs as a `notification.deliver` job on the existing queue (retry/backoff/dead
  letter come free).
- `notification_preference` — org, user_id, event_kind, channel, enabled boolean.
  Defaults: in-app on for everything; email on for review requests, rejections, failures;
  WhatsApp off until the org enables it.
- Event catalog (emitted by existing cores at their audit points):
  `report.awaiting_review`, `report.rejected`, `report.approved`, `report.processing_failed`,
  `report.missing` (cutoff sweep job), `blocker.raised`, `blocker.overdue`,
  `material.shortage`, `rfq.quote_requested`, `po.awaiting_approval`,
  `invoice.awaiting_review`, `mb.awaiting_verification`, `compliance.due_soon`.
- `packages/notify`: `EmailPort` (localFs adapter writes .eml files under
  local-storage/outbox/email; SMTP/provider adapter later), `WhatsAppPort` (localFs mock
  writing .json message files; Meta Cloud API adapter later behind approved templates).
  Provider selection via NOTIFY_EMAIL_PROVIDER / NOTIFY_WHATSAPP_PROVIDER, unknown → throw.
- In-app UI: bell in AppHeader with unread count, /notifications page, per-event preference
  matrix on /account page. No lock-screen-style content in email/WhatsApp payloads.

## Portfolio dashboard (`/portfolio`)

Exception-first (design.md §9), every tile links to underlying records:
- missing/late DPRs today (per project, from report expectations + cutoff)
- reports awaiting review, processing failures (link to review inbox)
- critical unresolved blockers, overdue blockers
- schedule delay indicators (reuse projectOverview per project)
- material shortage alerts (stock < reorder threshold)
- pending: invoices awaiting review, PO drafts awaiting approval, MB awaiting verification
- budget: org rollup of budget vs actual vs committed (INR, links to project budget pages)
- adoption: 7-day submission completeness per project; processing reliability (job dead/fail
  counts from the job table — doubles as the provider-health view for admins)

Implementation: `portfolio-core.ts` aggregating existing queries (no new tables); one page,
server-rendered, `org.audit.read` OR `project.read` scoping (users see only their projects).

## Search + grounded assistant

- Extend Phase B FTS (approved reports) into `search_document` projection table: org,
  project, kind: report|invoice|receipt|rfi|blocker|mb_entry|document, ref_id, title, body
  tsvector, updated_at. Populated synchronously at approve/review/post/certify points
  (small writes, same tx) — rebuildable projection, not a source of truth.
- `pgvector`: `search_embedding` (search_document_id, embedding vector(1536), model text).
  `EmbeddingPort` in packages/ai: mock = deterministic hash-based vectors (stable, offline);
  OpenAI text-embedding-3-small behind AI_PROVIDER. PGlite mode: lexical-only (vector ops
  degrade explicitly — ADR-0002); real PG gets ANN index.
- `/search` page: filters (project, kind, date), tenant filter BEFORE ranking, results show
  source record + status badge (approved vs draft clearly separated).
- Assistant (`/assistant`): retrieval-grounded answers.
  1. resolve scope (memberships) → candidate projects;
  2. deterministic intent shortcuts for the canonical questions (delayed projects, overdue
     blockers, stock levels, invoices > amount, missing reports) answered by SQL with
     citations — no LLM required, always exact;
  3. free-text questions: retrieve top-k search_documents (lexical + vector), then
     `GroundedAnswerPort` (mock: extractive answer listing sources; OpenAI: structured
     output `{answer, citations[], confidence, insufficient_evidence}`) — prompt forbids
     invented numbers; server rejects answers whose citations reference records outside
     the user's scope; UI renders citations as links and shows "Not enough evidence" when
     flagged. Assistant NEVER mutates records (read-only core, no action imports).

## Compliance evidence packs

- `compliance_pack` — org, project, kind: dpcc_dust|grap|rera_quarterly|custom, title,
  period_start/end, status: draft|in_review|reviewed|exported, reviewed_by?, created_by.
- `compliance_requirement` — pack_id, requirement text, owner_name?, due_date?, status:
  pending|satisfied|not_applicable, satisfied_by_kind/ref (report|attachment|document|
  mb_entry|note), note.
- Requirement templates per kind seeded from `packages/domain/src/compliance/templates.ts`
  (jurisdiction-neutral wording, each template carries a "verify current legal requirements"
  caution — rules.md §12 memory.md regulatory caution).
- Pack export: versioned ZIP (manifest.json + evidence files streamed from storage +
  requirements.csv + cover PDF labeled "DRAFT — requires professional review" until status
  reviewed, then "Reviewed by <name> on <date>"). `compliance_export` row per export
  (version int, object_key, checksum) — immutable, superseding like issued documents.
- Missing-evidence warnings = requirements past due_date without satisfied status.
- No government portal submission anywhere.

## Sequencing

E1 notifications (tables + ports + event emission + bell/page/preferences) →
E2 portfolio dashboard → E3 search projection + embeddings + /search →
E4 assistant → E5 compliance packs + exports. RLS + capability checks + audit + tests per
the Phase B pattern (`compliance.manage`/`compliance.review` caps exist; notifications use
recipient scoping; assistant/search use project.read).
