# BuildFlow AI

BuildFlow is an Android-first, multi-tenant construction operations system for Indian
contractors, developers and EPC firms. Field evidence (voice, photos and documents) becomes
an AI-assisted draft, then a human-approved project record used by reports, controls,
materials, costs, measurement, compliance and grounded portfolio answers.

**Engineering status (2026-07-19):** Phases A–F of the complete MVP are implemented and the
Google Cloud production runtime is deployed. Pull requests run the complete release gate;
successful commits to `main` build digest-pinned images, migrate Cloud SQL and deploy the web
and worker runtimes through keyless GitHub OIDC. See `docs/RELEASE-EVIDENCE.md` and
`infrastructure/gcp/README.md`.

## Repository layout

```text
apps/
  web/            Next.js 15 web OS, server actions and /api/v1 REST API
  mobile/         Expo field capture app with durable offline sync
  worker/         database-backed asynchronous worker
packages/
  domain/         framework-free policies, calculations, schemas and formatting
  db/             Drizzle schema, migrations, RLS, tenant queries and seeds
  contracts/      API contracts and OpenAPI 3.1 document
  auth/           portable authentication port and credential/session adapter
  jobs/           transactional queue, leases, retries and dead letters
  ai/             transcription, extraction and summary provider ports
  storage/        local-FS, Google Cloud Storage and Supabase Storage adapters
  pipeline/       DPR/document processing stages and job registry
  lifecycle/      organization export, retention and deletion workflows
  observability/  allow-listed structured logs and trace context
  notify/         in-app, email and WhatsApp notification adapters
  pdf/            issued DPR and compliance PDF rendering
infrastructure/   OpenTofu staging/production definitions
docs/             API guide, SLOs, ADRs, runbooks, threat models and release evidence
```

## Prerequisites

- Node.js 22 or newer
- pnpm 9 through Corepack (`corepack enable pnpm`)
- Chromium for Playwright (`pnpm exec playwright install chromium`)
- Docker only for the real-PostgreSQL release check

## Run locally

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:3000>. Local mode uses synthetic demo accounts, deterministic mock AI,
embedded PGlite and local private storage. Do not place customer data in a local environment.
Set `SIGNUPS_ENABLED=1` only when self-service organization registration is intended; customer
environments keep demo seeding and one-click demo login disabled.

Seed the richer two-project demonstration dataset when needed:

```bash
pnpm seed:demo
```

## Run with PostgreSQL and a worker

```bash
docker compose up -d db
DATABASE_URL=postgresql://buildflow:buildflow@localhost:5432/buildflow pnpm dev
DATABASE_URL=postgresql://buildflow:buildflow@localhost:5432/buildflow \
  JOBS_MODE=worker pnpm --filter @buildflow/worker dev
```

The same reviewed migrations serve embedded PGlite, Docker PostgreSQL and managed PostgreSQL.
Production evidence storage uses the Google Cloud Storage adapter with
`STORAGE_PROVIDER=gcs` and `GCS_STORAGE_BUCKET`. The portable Supabase adapter remains
available when its three server-side variables are configured together. Otherwise the
application intentionally stays on local storage.

## Verify a release

```bash
pnpm verify:release

# Requires a disposable real PostgreSQL database:
DATABASE_URL=postgresql://buildflow:buildflow@localhost:5432/buildflow \
  pnpm --filter @buildflow/db verify:real-pg
```

`verify:release` runs the secret scan, all typechecks, all Vitest suites, the production
build and Playwright journeys for accessibility/reflow, capture-to-issued-PDF and navigation.
CI uses Node 22 and also provisions PostgreSQL for the migration/RLS gate.

## Providers and safety

Mock AI is the default. Set `AI_PROVIDER=gemini`, `GOOGLE_CLOUD_PROJECT` and an approved
Vertex AI location to use workload-identity authenticated Gemini models. The OpenAI adapter
remains portable. Provider keys and storage service credentials must never reach the browser;
unknown provider values fail closed.

AI output is always a draft until an accountable user approves it. BuildFlow does not make
autonomous payments, procurement decisions, progress claims or government submissions.

## Project documents

Start with [PRD.md](PRD.md), [Architecture.MD](Architecture.MD), [rules.md](rules.md),
[phases.md](phases.md), [design.md](design.md) and [memory.md](memory.md). Operational details
are in [docs/API.md](docs/API.md), [docs/SLO.md](docs/SLO.md) and the runbooks under `docs/`.
