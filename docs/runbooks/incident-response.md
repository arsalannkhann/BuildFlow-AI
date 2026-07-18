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

- Managed Postgres (Supabase/prod): use provider PITR; restore to a NEW instance, verify
  counts + latest `audit_event` continuity, then repoint `DATABASE_URL`.
- Storage: objects are immutable-by-key; restore = copy prefix back; attachment checksums
  verify integrity after restore.
- Drill (Phase F gate): restore latest backup to staging, run the e2e suite against it.

## Post-incident

Within 48h: timeline, blast radius (orgs/reports affected — counts, not content), root
cause, corrective actions with owners, and a `memory.md` decision-log entry if behavior
or architecture changes.
