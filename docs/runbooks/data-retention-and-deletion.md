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
2. Run the export against a read replica or off-hours:
   - relational: `pg_dump --schema=public --no-owner` filtered by `organization_id`
     (per-table `\copy (select … where organization_id = $ORG) to csv` for portability), or
     the in-app export (Phase F admin UI) which produces CSV/JSON per module.
   - evidence: copy the `org/<orgId>/` prefix from the storage root.
3. Record an `audit_event` (`org.exported`) with the request reference.
4. Deliver via an expiring, access-controlled channel. Never email raw archives.

## Deletion (offboarding or DPDP-style request)

Deletion is asynchronous and staged; never run ad-hoc `DELETE` statements on production.

1. Confirm authorization in writing from an organization owner; record the request id.
2. Freeze access: deactivate users (`user.is_active = false`), revoke invitations and
   client links (`update client_link set revoked_at = now() where organization_id = …`).
3. Snapshot a final export if contractually required (see above) BEFORE destruction.
4. Destroy in dependency order inside a transaction per batch:
   evidence-derived rows → revisions/decisions → reports → controls/commercial rows →
   memberships/credentials/sessions/users → reference data → organization row last.
5. Evidence objects: delete the `org/<orgId>/` prefix after the DB pass succeeds.
6. Preserve ONLY the legally required audit skeleton: `audit_event` rows may be retained
   with `metadata` nulled if policy demands traceability without content.
7. Write the completion `audit_event` in the operator organization and close the ticket.

## Verification

- `select count(*) from <each tenant table> where organization_id = $ORG` → 0 everywhere
  except retained audit rows.
- Storage prefix listing is empty.
- A cross-tenant probe with a stale object id returns 404 (fail-closed check).
