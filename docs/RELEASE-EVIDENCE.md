# Phase F release evidence

**Recorded:** 2026-07-19
**State:** deployed engineering release candidate; independent review outstanding

## Automated gate

Run from the repository root:

```bash
pnpm verify:release
```

Evidence recorded for this candidate:

- secret scan passed across 694 tracked/non-ignored files;
- TypeScript checks passed for all 15 workspace packages;
- 65 Vitest files / 168 tests passed, including Gemini and GCS provider contracts;
- the optimized Next.js production build passed;
- the existing Phase F Playwright journeys cover registration/onboarding, automated
  WCAG/reflow, capture-to-issued-PDF and navigation dead-link auditing.

The developer shell uses Node 20 and prints the upstream Supabase SDK deprecation warning.
Cloud Build and the production containers use Node 22 or newer, which is the documented
minimum.

## Google Cloud runtime evidence

Project: `buildflow-ai-502915`
Region: `asia-south1` (Vertex AI global endpoint where configured)

### Database

- Cloud SQL for PostgreSQL 16 instance: `buildflow-pg`
- Database: `buildflow`
- Migration job: `buildflow-migrate`
- Successful execution: `buildflow-migrate-p7f5s`
- Result: migrations completed against Cloud SQL, including pgvector and tenant RLS setup.

The application connects through the Cloud Run Cloud SQL connector. Credentials are held in
Secret Manager and are not stored in repository files or ordinary environment-variable values.

### Private evidence storage

- Bucket: `buildflow-ai-502915-buildflow-evidence`
- Uniform bucket-level access, public-access prevention and object versioning are enabled.
- A one-time smoke job running as the production worker service account uploaded a synthetic
  object, generated a V4 signed download URL, validated its contents, and deleted the object.
- Runtime result: `gcs_runtime_smoke=ready`.

### Gemini on Vertex AI

- Runtime provider: Gemini through Vertex AI and Application Default Credentials.
- Default generation/reasoning model: `gemini-2.5-flash`.
- Embedding model: `gemini-embedding-001` with 1,536 output dimensions.
- A one-time smoke job running as the production worker service account completed a structured
  Gemini request. Runtime result: `gemini_runtime_smoke=ready`.

### Application services

- Web: Cloud Run service `buildflow-web`, public HTTPS ingress, scale-to-zero, Cloud SQL
  attachment, Secret Manager references and a dedicated service account.
- Worker: Cloud Run worker pool `buildflow-worker`, one baseline instance, Cloud SQL attachment,
  Gemini/GCS configuration and a dedicated service account.
- Worker revision `buildflow-worker-00001-t6t` emitted `worker.started` and no loop-failure log
  during the deployment check.
- Web revision `buildflow-web-00003-q5z` serves 100% of traffic from immutable image digest
  `sha256:54d3e054f8b31e31b5a9130dde1b2b822d3e626f293713a350d9b5180b6a4638`.
- `/`, `/login`, `/signup` and `/api/v1/openapi.json` returned HTTP 200.
- An invalid login reached the production database-backed auth path and returned the expected
  HTTP 401 `Invalid credentials` response.
- No severity-error or module-resolution log was present for the final web revision after the
  smoke run.

## Review requirement

Migration `0011`, FORCE-RLS policies, retention/deletion behavior and the production
authentication/storage configuration still require a second qualified reviewer before this
candidate is treated as a governed production release, per `rules.md`. The technical deployment
does not waive that requirement.
