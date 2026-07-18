# ADR-0001 — Serve the MVP API from the Next.js modular monolith, not a separate NestJS app

**Status:** Accepted 2026-07-19
**Deciders:** Principal product engineer (MVP build)
**Context docs:** `Architecture.MD` §4 (preferred stack lists NestJS + Fastify), audit in `docs/GAP-ANALYSIS.md`

## Context

The audited DPR vertical slice implements the whole workflow inside one Next.js app with
hard internal boundaries (`packages/domain`, `packages/db`, `packages/ai`, `packages/storage`
after the monorepo migration). The brief requires preserving working functionality and
migrating incrementally, while also listing NestJS/Fastify as the preferred production API.

A separate NestJS deployable today would mean rewriting working, tested server actions and
route handlers with no change in externally observable behavior, and would double the
authentication/tenancy surface to secure during the MVP.

## Decision

- The MVP API lives in the Next.js app (`apps/web`): server actions for the web UI, plus
  versioned REST route handlers under `/api/v1/*` (OpenAPI 3.1 documented, Zod-validated)
  for the Expo mobile app and external integrations.
- All domain logic stays in framework-free workspace packages; route handlers and server
  actions are thin transport shims over the same application services. Nothing imports
  Next.js from `packages/*`.
- Background work runs in a separate worker process (`apps/worker`) consuming the durable
  job queue — the "asynchronous workers" half of the modular monolith is real.

## Consequences

- One deployable fewer to build, secure, and operate during the MVP; zero rewrite of the
  audited slice.
- The NestJS extraction path is preserved: because contracts (`packages/contracts`) and
  application services are framework-free, standing up NestJS later is a transport-layer
  port, not a domain rewrite. Trigger for revisiting: independent API scaling needs,
  non-Next.js consumers requiring long-lived connections, or team ownership boundaries
  (Architecture.MD §21 Stage C).
- Web and API share a runtime; a web-render issue can affect API latency. Accepted for MVP
  scale; Cloud Run autoscaling and the separate worker mitigate the AI-heavy paths.
