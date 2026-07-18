# BuildFlow AI

Android-first, multi-tenant construction operations platform for Indian contractors,
developers and EPC firms. Field capture (voice, photos, documents) → AI extraction → human
review → approved project record → dashboards, materials, costs, compliance evidence and
grounded answers.

**Status (2026-07-19):** the audited DPR vertical slice (`docs/GAP-ANALYSIS.md`) is being
expanded into the complete MVP — Phases A–F in [phases.md](phases.md) §0. Phase A
(monorepo foundation, real auth, RLS, durable jobs, dual-driver Postgres) is landing now.

## Repository layout

```
apps/
  web/        Next.js 15 management app + server actions (+ /v1 API in Phase B)
  worker/     durable job runner (requires real Postgres; see ADR-0003)
packages/
  domain/     framework-free: DPR schema, report state machine, tenancy/roles, ids, password hashing
  db/         Drizzle schema, SQL migrations (incl. RLS), tenant-scoped queries, seed
  auth/       AuthPort: dev credential adapter (scrypt + server-side sessions); Supabase adapter planned
  jobs/       transactional outbox + DB-backed job queue (lease/retry/backoff/dead-letter)
  ai/         Transcription/Extraction/Summary ports; deterministic mock (default) + OpenAI
  storage/    StoragePort; local-FS implementation (signed-URL adapter planned)
  pipeline/   DPR processing stages + job registry
  pdf/        issued-DPR HTML template + Playwright renderer
docs/         gap analysis, ADRs, superpowers specs/plans
prompts/      versioned prompt artifacts
```

## Prerequisites

- Node 20
- pnpm 9 via Corepack (`corepack enable pnpm`). pnpm 11 crashes on Node 20; stay on 9.
- Docker (optional — only for the real-PostgreSQL path)

## Run (zero-dependency mode)

```
pnpm install
pnpm exec playwright install chromium
cp .env.example .env.local   # defaults: mock AI, embedded PGlite, local storage
pnpm dev
```

Open http://localhost:3000 → sign in (demo quick-login cards, or email/password —
`engineer@demo.buildflow.local` / `manager@demo.buildflow.local`, password
`buildflow-demo`) → **Record update** → submit → switch to the manager → review → approve →
issue PDF → download.

## Run against real PostgreSQL (production path, ADR-0002)

```
docker compose up -d db
DATABASE_URL=postgresql://buildflow:buildflow@localhost:5432/buildflow pnpm dev
# optional separate worker (moves AI processing off the request path):
DATABASE_URL=postgresql://buildflow:buildflow@localhost:5432/buildflow JOBS_MODE=worker pnpm --filter @buildflow/worker dev
```

Migrations (including Row-Level-Security policies) apply automatically on boot. A Supabase
Postgres URL works the same way — set `DATABASE_URL` in `.env.local`.

## Test and verify

```
pnpm typecheck    # tsc across all workspace packages (turbo)
pnpm test         # Vitest unit + integration (hermetic, PGlite-backed) incl. RLS + cross-tenant suites
pnpm test:e2e     # Playwright: capture → process → review → approve → issue → download
pnpm build        # production build
pnpm --filter @buildflow/db verify:real-pg          # with DATABASE_URL: migrations+seed+RLS on real PG
```

CI (`.github/workflows/ci.yml`) runs typecheck/test/build, the e2e flow, and the
real-PostgreSQL verification against a service container.

Note on `pnpm test:e2e` on macOS: headless Chrome's microphone is OS-gated in
non-interactive runs, so the e2e injects a synthesized audio stream while still exercising
the real MediaRecorder → upload → pipeline path. Linux CI does not need this.

## AI providers

Mock provider (deterministic, offline) is the default. For OpenAI set in `.env.local`:

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Unknown `AI_PROVIDER` values fail loudly. Provider keys live server-side only.

## Architecture

See [Architecture.MD](Architecture.MD), the ADRs in [docs/adr/](docs/adr), mandatory rules
in [rules.md](rules.md), UX in [design.md](design.md), the working plan in
[phases.md](phases.md) §0, and durable context in [memory.md](memory.md).
