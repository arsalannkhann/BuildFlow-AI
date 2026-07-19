# Phase F plan — production hardening and release gates

**Date:** 2026-07-19 · Implementation checklist. Automated evidence is recorded in
`docs/RELEASE-EVIDENCE.md`; external gates are explicitly recorded as F-W1/F-W2 in
`memory.md` and must pass before deployment.

## Localization and accessibility
- [x] Web i18n foundation: locale-aware dates (project timezone), Indian digit grouping
      everywhere money renders (packages/domain money.ts is the only formatter).
- [x] English UI copy audit against design.md §18; Hindi string catalog for mobile verified.
- [x] Automated WCAG 2.2 A/AA pass on primary journeys (login, capture, review, approve/issue, project
      overview, portfolio): landmarks, labels, focus, contrast, zoom 200%, keyboard-only.
- [x] prefers-reduced-motion respected (AutoRefresh polling stays; no animation deps).

## Observability and operations
- [x] Structured request/job logging with trace ids; no customer narrative in logs
      (grep-audit log statements).
- [x] Job dead-letter + stuck-PROCESSING sweeper surfaced on admin provider-health page
      (Phase E portfolio adoption tile links here).
- [x] SLO doc: submission→review-ready latency, job failure rate, upload failure rate.
- [x] Backup/restore: document PGlite (dev) vs managed Postgres (prod) procedures; restore
      drill runbook (docs/runbooks/ exists — extend with restore steps and verify commands).

## Data lifecycle
- [x] Export: org-scoped ZIP export job (reports+revisions+attachments manifest+CSV
      registers) behind org.export capability, audit-logged.
- [x] Retention: per-org retention settings honored by a sweep job (evidence + derived AI
      artifacts cascade — rules.md §14); deletion workflow with grace period + audit.
- [x] .env.example complete (names only); secrets scan in CI.

## Commercial readiness
- [x] Usage meters (projects, users, storage bytes, AI runs) computed from existing tables
      on the org admin page; Starter/Professional/Enterprise entitlement gates enforced in
      one `entitlements.ts` policy module (soft limits + clear upgrade copy; manual billing
      state field on organization).
- [x] Demo organization seed: realistic Indian construction dataset (Sector 62 Tower A +
      a second project, 14 days of reports, materials, budget, MB entries) behind
      `pnpm seed:demo` — synthetic data only.
- [x] Onboarding: opt-in registration → project → invite → downloadable sample CSVs.

## Security review
- [x] Re-run cross-tenant negative suite across Phase C/D/E resources.
- [x] withTenant RLS GUC wiring on mobile `/api/v1` request paths; web services retain
      mandatory explicit tenant filters and capability checks.
- [ ] Live signed-URL storage smoke — adapter contract passes; staging check is F-W2.
- [x] Threat model (docs/threat-models/) delta review for Phase C/D/E/F additions.
- [x] Rate limits on registration/auth/public link/API routes; input size limits audited.

## Release gates (must all be green)
- [x] `pnpm verify:release`: secret scan, all typechecks/tests/build/e2e.
- [ ] `verify:real-pg` against Docker Postgres — local environment unavailable; F-W1.
- [x] Mobile typecheck + 14-test sync-engine suite.
- [x] Acceptance scenarios 1–20 recorded with executable evidence in `docs/ACCEPTANCE.md`.
- [x] No placeholder/dead routes: automated navigation destination audit.
- [x] memory.md, README.md, phases.md, Architecture.MD current.
