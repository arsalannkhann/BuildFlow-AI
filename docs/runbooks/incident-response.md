# Runbook — incident response

**Scope:** processing failures, data-loss signals, tenant-isolation suspicion, provider
outages. **First rule:** never query or screenshot customer content while diagnosing;
work from ids, statuses, and audit events (rules.md §16).

## Severity ladder

- **SEV-1:** cross-tenant exposure, acknowledged-draft loss, credential/token leak.
- **SEV-2:** processing pipeline down (>15 min), issued-PDF generation failing, sync API 5xx.
- **SEV-3:** single-report failures, provider degradation with fallback available.

## Triage — processing failures

1. Find the report: `select id, status, updated_at from daily_report where status in
   ('PROCESSING','PROCESSING_FAILED') order by updated_at` (scoped to the affected org).
2. Inspect the run: `processing_run` / `processing_stage` rows give the failed stage and
   `error_category` — never the content.
3. Inspect the job: `select status, attempts, last_error, run_after from job where
   payload->>'reportId' = $ID`.
   - `dead` → fix cause, then requeue by inserting a fresh job (`report.process`, new
     idempotency key) or use the review UI's **Retry processing** (does exactly this).
   - stuck `leased` with expired lease → the runner reclaims automatically; if the worker
     crashed, restart it (`pnpm --filter @buildflow/worker start`).
4. If AI provider is down: `AI_PROVIDER=mock` is NOT a production fallback (it fabricates
   deterministic fixtures). Instead leave reports in PROCESSING_FAILED — inputs are safe —
   and communicate; reviewers can use **Prepare manually** for urgent reports.

## Triage — sync/upload complaints

- Manifest exists? `daily_report.client_report_id = <device id>` — if absent, the device
  never reached the API (network/auth). If SYNCING: `select client_attachment_id,
  uploaded_at from attachment where report_id = …` shows which upload is pending.
- Finalize 409 means an attachment never uploaded; the mobile queue retries in order —
  no server action needed unless the row shows a checksum mismatch (device file changed;
  user must recapture).

## Tenant-isolation suspicion (SEV-1)

1. Preserve evidence: copy the request logs and the `audit_event` window.
2. Kill exposure: revoke the session (`delete from session where id = sha256(token)`),
   revoke client links, rotate any implicated tokens.
3. Verify the boundary: run the cross-tenant suite (`pnpm vitest run packages/db/src/security
   apps/web/src/core`) against a copy; check RLS is active (`select relname from pg_class
   where relrowsecurity`).
4. Notify per contract/legal obligations before public statements.

## Backup / restore (local + managed)

### PGlite development data

1. Stop the web process so the embedded database is quiescent.
2. Copy the complete `PGLITE_DATA_DIR` and `STORAGE_DIR` directories to a timestamped backup.
3. Restore into new directories, point the two environment variables at them, and run
   `pnpm dev`. Never overwrite the only copy during a drill.
4. Verify `select count(*) from organization`, open an issued PDF, then run `pnpm test:e2e`.

### Managed PostgreSQL / Supabase production

1. Prefer provider point-in-time recovery within the contracted recovery window. Restore to
   a **new** database/project; never restore over the incident source.
2. For a logical backup drill use `pg_dump --format=custom --no-owner "$DATABASE_URL"` and
   `pg_restore --no-owner --exit-on-error --dbname "$RESTORE_DATABASE_URL" backup.dump`.
3. Set the restored runtime connection to the non-owner `buildflow_app` role. Verify the
   latest migration journal, FORCE RLS policies, organization/project/report counts, latest
   append-only `audit_event`, and zero cross-tenant probe results.
4. Restore private storage to an isolated bucket/prefix. Sample every object class and compare
   stored SHA-256 checksums; keep public access prevention enabled.
5. Point a staging web+worker pair to the restored database/bucket and run `pnpm typecheck`,
   `pnpm test`, `pnpm test:e2e`, and the 20 acceptance scenarios. Destroy the drill copy under
   the documented retention policy.

**Targets:** database RPO ≤ provider backup interval (PITR target ≤ 15 min), RTO ≤ 4 h for
pilot production. Run a restore drill before launch and quarterly; record date, backup age,
duration, verifier and exceptions in the release evidence.

## Post-incident

Within 48h: timeline, blast radius (orgs/reports affected — counts, not content), root
cause, corrective actions with owners, and a `memory.md` decision-log entry if behavior
or architecture changes.
