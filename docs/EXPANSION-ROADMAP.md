# Expansion roadmap — from deployed MVP to a system contractors run their business on

**Date:** 2026-07-19 · **Basis:** the deployed Google Cloud runtime (Cloud Run web/worker,
Cloud SQL 16 + pgvector, private GCS, Gemini on Vertex AI) and the audited Phase A–F MVP.
This is the engineering answer to "expand the architecture so it solves the real-world
problem": the platform is feature-complete for the MVP loop; what stands between it and
daily operational dependence at a Delhi NCR contractor is **adoption channel fit, speech
accuracy on real site audio, the money loop, and operational discipline** — not more modules.

The architecture principle stays: modular monolith + workers on PostgreSQL. Every expansion
below rides existing ports (transcription, extraction, storage, jobs, notify) — no new
datastores, no microservices, no agent frameworks (rules.md §23 still applies).

## R0 — governance debt that gates everything (this week)

1. Rotate the Supabase anon/service keys that transited chat during setup; confirm no
   Supabase secret is live in the GCP runtime (it runs on Cloud SQL + GCS).
2. Close F-W1 (migrations+RLS verification on disposable real PostgreSQL — CI already has
   the job; run it green on `main`) and F-W2 (live signed-URL smoke — done for GCS per
   RELEASE-EVIDENCE; retire the Supabase-specific wording or re-point it at GCS).
3. Second qualified review of the deployed release candidate, then tag `v0.1.0`.
4. Play-store readiness for the APK: generate a proper upload keystore (the current APK is
   debug-signed — fine for sideloading pilots, not for Play distribution), set
   `versionCode` automation, and decide package id ownership (`com.buildflow.mobile`).

## R1 — field adoption loop (weeks 1–4): win the site engineer

The product only solves the real problem if updates arrive every day without chasing.

- **WhatsApp ingestion adapter.** The dominant capture channel in Indian construction is a
  WhatsApp voice note. Add an ingestion service behind the existing ports: Meta Cloud API
  webhook (Cloud Run) → sender-to-user mapping (verified mobile on membership) → media
  fetched server-side → the SAME manifest → attachment → finalize pipeline used by mobile
  (sync-core), so idempotency, evidence immutability and review flow are identical.
  Approved-template replies confirm receipt/status. Consent recorded per sender; unknown
  senders get a polite enrolment message, never data ingestion. No group scraping.
- **Hinglish speech benchmark.** Collect a consented, de-identified corpus from pilot sites
  (target: 50 clips × noise/accent/trade variety). Score Gemini vs **Sarvam** vs
  **Bhashini** adapters (both implement the existing `TranscriptionPort`) on
  field-critical slices: quantities, units, dates, negation, material names. Promote the
  winner per language via provider routing config; keep the eval as a release gate for any
  prompt/provider change (rules.md §12 finally gets teeth).
- **Report expectations engine.** The cutoff sweep exists; add the escalation ladder that
  makes managers stop chasing: T+0 in-app nudge to the engineer, T+2h WhatsApp reminder
  (template), T+cutoff manager digest listing who is missing. Every reminder deep-links to
  capture. Measure: % expected DPRs submitted without a human chase.
- **Device pilot.** Three live sites, two weeks, the debug-keystore APK is sufficient.
  Exit: ≥70% on-time submission, median capture ≤5 min, correction severity trending down.

## R2 — the money loop (weeks 3–8): win the accountant and director

Reports earn adoption; money retains it.

- **Tally bridge.** Replace the CSV/JSON "suitable for Tally" export with a real Tally
  Prime import artifact (XML vouchers for purchases/payments), plus GSTIN checksum and
  HSN validation at invoice review time. Still export-only — BuildFlow never posts
  vouchers itself.
- **Three-way match.** PO ↔ receipt ↔ invoice all exist; add the deterministic variance
  join (qty/rate/tax deltas with record links) surfaced at invoice review and on the
  portfolio exceptions board. This is the single highest-leverage fraud/leakage control
  for the director persona.
- **RA-bill deepening.** Certified MB entries already export a supporting statement; add
  the deterministic RA-bill draft math (measured-to-date, previous-bill deductions,
  retention %, mobilization recovery) — human-reviewed, clearly labeled draft.
- **Cost-per-approved-DPR meter.** Vertex spend attribution per processing run (tokens ×
  price table) rolled into the org usage page — the unit-economics number that governs
  pricing (PRD §15) and provider routing.

## R3 — production operations at scale (weeks 6–12)

- **Cloud Tasks dispatcher** (ADR-0003 stage 2) once job volume or latency SLOs demand it;
  Cloud Scheduler owns sweeps (missing reports, retention, service reminders). The DB
  queue remains the source of truth; Tasks is dispatch only.
- **Direct-to-GCS uploads.** The `/v1` contract already returns `uploadUrl`; swap the
  server-proxied PUT for V4 signed URLs from the storage adapter so audio/photos bypass
  Cloud Run (cost + 100MB request limits). Mobile needs zero changes beyond following the
  URL it is given.
- **Media derivatives worker.** Thumbnail/compressed variants for photo-heavy reports and
  PDFs; originals stay immutable per rules.md §13.
- **SLO enforcement.** Wire docs/SLO.md to Cloud Monitoring alerts (submission→review-ready
  p90, job dead-letter rate, upload failure rate) with the runbooks as the alert payload.
  Budget alerts on Vertex + Cloud SQL spend.
- **DR drill.** Cloud SQL PITR restore exercised quarterly (runbook exists; schedule it),
  GCS versioned-object restore test, and a documented RTO/RPO statement for customers.

## R4 — commercial scale-out (months 3–6)

- Razorpay subscription billing when manual invoicing saturates (~15 paying orgs);
  entitlements module already enforces limits, so this is payment plumbing only.
- Assisted onboarding: importer for the customer's existing activity/BOQ spreadsheets with
  a mapping review screen (no silent guessing), sample-data teardown switch.
- Multi-region posture review: data residency stays asia-south1; evaluate read replicas
  only if portfolio dashboards show measured latency pain.

## Deliberate non-goals (unchanged until evidence demands otherwise)

Computer-vision progress percentages, biometric attendance, automated government filing,
autonomous procurement/payments, Neo4j/knowledge graphs, Kubernetes, microservices. Each
has a documented trigger in Architecture.MD/PRD; none is blocked by this roadmap's
architecture.

## The measures that decide everything

1. **Trusted approved project-days** (north star) — target ≥70% of expected days.
2. Median capture effort ≤5 minutes; correction severity declining week over week.
3. % of updates arriving via WhatsApp vs app (channel-fit signal, not a vanity metric).
4. Cost per approved DPR (all-in AI + infra) — must stay compatible with ₹10–25k/project
   pilots.
5. Three paying design partners; two renewals; one expansion (PRD §14 unchanged).
