# ADR-0003 — Transactional outbox + DB-backed durable job queue behind a port

**Status:** Accepted 2026-07-19

## Context

The slice ran AI processing synchronously inside the capture server action. The MVP needs
durable, independently retryable background stages (AI pipeline, OCR, PDF, notifications,
exports) without adding Redis/Kafka (`Architecture.MD` §23). The preferred production
dispatcher is Google Cloud Tasks.

## Decision

- Every domain change that requires background work writes a row to a `job_outbox` table in
  the same transaction (transactional outbox).
- A `JobQueuePort` abstracts dispatch/lease/complete/fail-with-backoff. Implementations:
  - **DB-backed runner** (default, local + MVP production-capable): `apps/worker` polls with
    `FOR UPDATE SKIP LOCKED` leases, per-job idempotency keys, bounded retries with
    exponential backoff, and a dead-letter state visible in the admin processing dashboard.
  - **Cloud Tasks adapter** (production dispatch): the outbox dispatcher enqueues HTTP tasks
    targeting worker endpoints; handlers are the same idempotent job functions.
- Jobs carry signed tenant context; handlers re-authorize before touching tenant data.
- Job handlers must be idempotent; retrying any job must not duplicate domain records
  (enforced by idempotency keys and DB unique constraints, covered by tests).

## Consequences

- No broker to operate; Postgres is already the source of truth and easily handles MVP job
  volume. Polling latency (~1s) is acceptable for AI-processing SLOs (3-minute target).
- Clean lift to Cloud Tasks later because handlers are transport-agnostic.
