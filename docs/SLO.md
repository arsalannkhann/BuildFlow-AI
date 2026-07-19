# BuildFlow MVP service levels

**Effective:** 2026-07-19 · **Owner:** product engineering on-call · **Scope:** production
web/API, mobile sync, worker, PostgreSQL and private object storage.

## Service-level indicators and objectives

| Journey / signal | Measurement | MVP objective (rolling 28 days) | Alert |
|---|---|---:|---|
| API availability | non-5xx `/api/v1/*` responses ÷ all `/api/v1/*` responses | ≥ 99.5% | burn rate > 2× for 30 min |
| Submission → review-ready | `AWAITING_REVIEW.updated_at - daily_report.created_at` for completed submissions | p95 < 5 min | p95 > 8 min for 15 min |
| Background job reliability | jobs ending `dead` ÷ jobs started | < 2% | > 5% over 15 min or any deletion/export job dead |
| Upload reliability | attachment upload non-2xx ÷ upload attempts, excluding 4xx validation | < 1% | > 3% over 15 min |
| Stuck processing | reports in `PROCESSING` for > 15 min | 0 after sweeper | any row surviving two sweeps |

The availability budget is approximately 3 h 22 min per 28-day window. Planned maintenance
counts unless the product is placed in an explicit read-only maintenance state communicated
to pilot customers.

## Safe telemetry

Request and job events carry trace ID, route/job kind, organization ID where authorized,
state, attempt, categorized failure and duration. They never contain narrative, transcript,
prompt, filename, email, phone, bearer token, public-link token, request body or job payload.
The organization **Provider and job health** page uses content-free database aggregates.

## Response policy

- Page the product engineering on-call for a SEV-1 isolation signal, any failed organization
  deletion, or a 14× availability burn rate.
- Open a SEV-2 incident for sustained pipeline/upload objectives or a provider outage.
- Follow [incident response](runbooks/incident-response.md); link every alert to that runbook.
- Do not switch production to mock AI. Preserve inputs, surface `PROCESSING_FAILED`, and use
  the human manual-draft path for urgent reports.

## Review cadence

Review objectives weekly during pilots. Record breaches, excluded traffic, and corrective
actions without customer content. Tighten objectives only after four stable weeks; an SLO
change requires a PR and named owner.
