# Phase F plan — production hardening and release gates

**Date:** 2026-07-19 · Checklist-form plan. Exit = all 20 acceptance scenarios in the MVP
brief pass and every box below is checked or explicitly waived in memory.md.

## Localization and accessibility
- [ ] Web i18n foundation: locale-aware dates (project timezone), Indian digit grouping
      everywhere money renders (packages/domain money.ts is the only formatter).
- [ ] English UI copy audit against design.md §18; Hindi string catalog for mobile verified.
- [ ] WCAG 2.2 AA pass on primary journeys (login, capture, review, approve/issue, project
      overview, portfolio): landmarks, labels, focus, contrast, zoom 200%, keyboard-only.
- [ ] prefers-reduced-motion respected (AutoRefresh polling stays; no animation deps).

## Observability and operations
- [ ] Structured request/job logging with trace ids; no customer narrative in logs
      (grep-audit log statements).
- [ ] Job dead-letter + stuck-PROCESSING sweeper surfaced on admin provider-health page
      (Phase E portfolio adoption tile links here).
- [ ] SLO doc: submission→review-ready latency, job failure rate, upload failure rate.
- [ ] Backup/restore: document PGlite (dev) vs managed Postgres (prod) procedures; restore
      drill runbook (docs/runbooks/ exists — extend with restore steps and verify commands).

## Data lifecycle
- [ ] Export: org-scoped ZIP export job (reports+revisions+attachments manifest+CSV
      registers) behind org.export capability, audit-logged.
- [ ] Retention: per-org retention settings honored by a sweep job (evidence + derived AI
      artifacts cascade — rules.md §14); deletion workflow with grace period + audit.
- [ ] .env.example complete (names only); secrets scan in CI.

## Commercial readiness
- [ ] Usage meters (projects, users, storage bytes, AI runs) computed from existing tables
      on the org admin page; Starter/Professional/Enterprise entitlement gates enforced in
      one `entitlements.ts` policy module (soft limits + clear upgrade copy; manual billing
      state field on organization).
- [ ] Demo organization seed: realistic Indian construction dataset (Sector 62 Tower A +
      a second project, 14 days of reports, materials, budget, MB entries) behind
      `pnpm seed:demo` — synthetic data only.
- [ ] Onboarding: first-run flow (create org → project → invite → sample CSVs downloadable).

## Security review
- [ ] Re-run cross-tenant negative suite across ALL Phase C/D/E resources.
- [ ] withTenant RLS GUC wiring on remaining request paths (deferred from Phase A).
- [ ] Signed-URL storage adapter interface verified against Supabase storage (manual smoke
      when SUPABASE_DATABASE_URL is activated); short-lived link audit.
- [ ] Threat model (docs/threat-models/) delta review for Phase C/D/E additions.
- [ ] Rate limits on auth + public link + API routes; input size limits audit.

## Release gates (must all be green)
- [ ] pnpm typecheck (all packages) · pnpm test · pnpm build · pnpm test:e2e
- [ ] verify:real-pg against Docker Postgres (migrations 0000→latest + RLS active)
- [ ] Mobile: pnpm --filter @buildflow/mobile typecheck + sync-engine suite
- [ ] Acceptance scenarios 1–20 walked through and recorded in docs/ACCEPTANCE.md
- [ ] No placeholder/dead routes: click-audit every nav destination
- [ ] memory.md, README.md, phases.md, Architecture.MD current
