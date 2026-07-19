# BuildFlow infrastructure (OpenTofu)

Definitions for the staging and production runtimes described in Architecture.MD §4/§20.
Nothing here is applied automatically — `tofu plan` output must be reviewed before any
`tofu apply`, and applying requires explicit human authorization.

## Layout

- `modules/cloud-run-service` — one Cloud Run v2 service (API/web or worker) with
  workload-identity service account, secret mounts, autoscaling bounds.
- `modules/cloud-tasks-queue` — durable dispatch queue for the transactional outbox
  (ADR-0003 Cloud Tasks adapter; the DB-backed runner remains the fallback).
- `modules/storage-bucket` — evidence bucket: uniform access, CMEK-ready, lifecycle rules
  aligned with retention policy, no public access.
- `modules/secrets` — Secret Manager entries (names only; values are set out-of-band).
- `environments/staging`, `environments/production` — composition roots. Production pins an
  approved India region (`asia-south1` / Mumbai); the managed Postgres (Supabase) project is
  referenced by URL secret, not provisioned here (see ADR-0002).

## State and identity

Remote state: GCS backend bucket per environment (`buildflow-tofu-state-<env>`), created
once manually. CI uses workload identity federation — no long-lived cloud keys (rules.md
§15). Every change lands via PR with `tofu plan` attached.

## What is deliberately NOT here

- Supabase project provisioning (managed via Supabase; region requirement documented).
- WhatsApp/Meta and OpenAI accounts (provider keys enter Secret Manager manually).
- Kubernetes, brokers, or per-module services (Architecture.MD §23 rejections).
