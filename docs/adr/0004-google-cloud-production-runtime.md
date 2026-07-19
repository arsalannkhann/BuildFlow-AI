# ADR-0004 — Google Cloud production runtime

- Status: accepted
- Date: 2026-07-19

## Context

The MVP is complete and its owner selected Google Cloud for the first managed production
deployment, including Gemini models. The existing runtime definitions referenced Supabase
Storage and OpenAI, while provider ports already made both replaceable. PostgreSQL remains the
system of record and current query measurements do not justify a separate graph database.

## Decision

- Run the public Next.js web/API container on Cloud Run.
- Run the pull-based database job runner as a single Cloud Run worker-pool instance.
- Use Cloud SQL for PostgreSQL 16 with pgvector and the existing reviewed migrations.
- Store private evidence in a Mumbai (`asia-south1`) Cloud Storage bucket using workload
  identity and short-lived V4 signed URLs.
- Use Vertex AI Gemini through the existing AI provider ports. Model IDs are runtime
  configuration so retirement does not require a domain change.
- Store secrets in Secret Manager and images in Artifact Registry.
- Gate deployments on the complete GitHub Actions release suite, then use branch-restricted
  Workload Identity Federation to build, migrate and deploy without a service-account key.
- Do not provision a VM, Kubernetes cluster, separate vector database, or graph database.

## Consequences

The application gains one-cloud operational ownership and removes long-lived provider keys for
storage and AI. The web and worker service accounts require narrowly scoped Cloud SQL, Storage,
Vertex AI and URL-signing permissions. A Gemini provider rollout requires schema-validation
tests, a synthetic live smoke test, monitoring, and the ability to switch `AI_PROVIDER` without
data migration. Cloud SQL and the worker pool have non-zero baseline cost. The CI deployment
identity can administer Cloud Run and submit Cloud Builds but cannot read secret payloads or
access customer evidence; its federation condition accepts only this repository's immutable
GitHub ID on `refs/heads/main`.

## Rollback

Deploy the previous immutable container digest and switch provider environment variables back to
the prior adapters. Database migrations remain forward-compatible; PostgreSQL stays the source of
truth, and GCS objects can be exported through the storage port.
