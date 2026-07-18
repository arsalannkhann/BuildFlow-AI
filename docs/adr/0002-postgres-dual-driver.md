# ADR-0002 — One Drizzle layer over real PostgreSQL (prod path) and embedded PGlite (test/dev default)

**Status:** Accepted 2026-07-19

## Context

The slice runs on embedded PGlite (real Postgres semantics, zero external dependency), which
made the whole flow runnable with no accounts and keeps tests hermetic. Production requires
managed PostgreSQL with RLS, backups, and extensions (`pgvector`, PostGIS).

## Decision

- `packages/db` exposes one Drizzle schema and one migration set with two drivers:
  - **node-postgres** against real PostgreSQL — Docker Compose locally
    (`docker compose up db`), managed Postgres (Supabase Mumbai) in production. Selected via
    `DATABASE_URL`.
  - **PGlite** — default when `DATABASE_URL` is unset: unit/integration tests and
    zero-dependency demo mode.
- RLS policies ship in the SQL migrations and are exercised by integration tests against
  real Postgres in CI. PGlite runs the same migrations; app-layer tenancy (explicit
  `TenantContext` on every query) remains the first enforcement layer everywhere.
- Features requiring extensions unavailable in PGlite (e.g. `pgvector` ANN indexes) degrade
  explicitly in PGlite mode (sequential scan / lexical-only search), never silently.

## Consequences

- Tests stay fast and hermetic; production behavior is verified against real Postgres in CI.
- Two drivers to keep compatible; mitigated by sharing one migration set and running the
  integration suite on both in CI.
