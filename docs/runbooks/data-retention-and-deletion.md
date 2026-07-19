# Runbook — data retention, export, and deletion

**Audience:** operators handling customer data requests. **Principle:** PostgreSQL is the
record; evidence objects and derived AI artifacts inherit the source record's policy
(Architecture.MD §17).

## Data classes and default posture

| Class | Where | Default retention |
|---|---|---|
| Identity (users, emails) | `user`, `auth_credential`, `session` | Life of membership; sessions 7 days |
| Operational records | reports, revisions, decisions, controls, MB, costs | Customer-configured; default: retain |
| Evidence | object storage under `org/<id>/…` + attachment rows | Customer-configured; default: retain |
| Derived AI | transcripts (in revisions), summaries, embeddings | Same policy as the source report |
| Audit | `audit_event` | Append-only; retained ≥ operational data |
| Jobs/telemetry | `job` rows, logs | 90 days; contain ids only, never content |

## Export (organization owner request)

1. Verify the requester holds `org.export` (organization owners do).
2. Use **Organization → Prepare new export**. It queues `organization.export` and produces a
   ZIP containing organization metadata, one CSV per tenant table, and an attachment/object
   manifest. It intentionally does not duplicate evidence binaries into the archive.
3. The request and completion write `organization.export_requested` and
   `organization.export_completed`. Download creates a five-minute signed URL in Supabase
   (or an authenticated no-store response in local mode) and is audited.
4. For a contractually required binary evidence handoff, copy the `org/<orgId>/` prefix to a
   separate private bucket after authorization. Never email raw archives.

## Deletion (offboarding or DPDP-style request)

Deletion is asynchronous and staged; never run ad-hoc `DELETE` statements on production.

1. One organization owner enters the exact organization name to request deletion. A different
   organization owner must approve it; the database rejects same-person approval.
2. Approval queues `organization.delete` for seven days after the request. Either owner can
   cancel while it is queued. Snapshot a final export before approval when contractually needed.
3. At execution the worker re-checks both distinct actors and the elapsed grace period, deletes
   every object under `org/<orgId>/`, then destroys credentials, sessions, tenant tables and the
   organization row in one transaction.
4. The same transaction preserves only a content-free `deletion_receipt`: one-way keyed hashes
   of organization/requester/approver IDs, aggregate row/object counts and completion time.
5. A production worker refuses to generate the receipt without
   `DELETION_RECEIPT_HMAC_KEY`. Never run ad-hoc production deletes.

## Verification

- `select count(*) from <each tenant table> where organization_id = $ORG` → 0 everywhere.
- Storage prefix listing is empty.
- A cross-tenant probe with a stale object id returns 404 (fail-closed check).
- One `deletion_receipt` exists and contains no raw identifiers or customer content.
