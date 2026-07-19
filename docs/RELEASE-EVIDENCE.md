# Phase F release evidence

**Recorded:** 2026-07-19
**State:** engineering release candidate; external environment gates open

## Automated gate

Run from the repository root:

```bash
pnpm verify:release
```

Result for this candidate:

- secret scan passed across 679 tracked/non-ignored files;
- TypeScript checks passed for all 15 workspace packages;
- 63 Vitest files / 164 tests, including mobile sync, tenant isolation, lifecycle,
  registration, storage adapters, operations and OpenAPI, all passed;
- optimized Next.js production build passed and Drizzle migration journal check passed;
- four serial Playwright journeys: registration/onboarding, automated WCAG/reflow,
  capture-to-issued-PDF and navigation dead-link audit, all passed.

The developer shell currently uses Node 20 and therefore prints the upstream Supabase SDK
deprecation warning. CI and deployment are pinned to Node 22; Node 22 is the documented
minimum and the warning is not waived for production.

## External gates

### F-W1 — real PostgreSQL migration/RLS check

**Local reason:** Docker Desktop is not running and no PostgreSQL service is available on
`127.0.0.1:5432`. This is an environment constraint, not a passing result.

Run on CI or a Docker-enabled machine:

```bash
docker compose up -d db
DATABASE_URL=postgresql://buildflow:buildflow@localhost:5432/buildflow \
  pnpm --filter @buildflow/db verify:real-pg
```

Required evidence: migration `0000`→`0011` succeeds and the script reports migrations,
seed and FORCE RLS active. Stop and investigate any warning or partial migration.

### F-W2 — managed storage smoke

**Reason:** no approved India-region Supabase bucket is configured in this workspace. The
adapter is contract-tested with signed upload/download behavior, but mocks are not a live
service result.

Required staging evidence:

1. configure `SUPABASE_URL`, server-only service-role key and a private bucket;
2. upload a synthetic object through `SupabaseStorage`;
3. verify short-lived signed download and upload URLs expire and remain bucket-scoped;
4. exercise organization export download and confirm its link audit event;
5. delete the synthetic prefix and confirm no customer data was used.

## Review requirement

Migration `0011`, FORCE-RLS policies, retention/deletion behavior and production
authentication/storage configuration require a second qualified reviewer before merge or
deployment, per `rules.md`. No local verification substitutes for that review.
