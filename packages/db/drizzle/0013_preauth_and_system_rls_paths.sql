-- Sanctioned non-tenant access paths for RLS (companion to 0002_rls_defense_in_depth).
--
-- 0002 assumed system paths would connect as the table-owning role, but FORCE ROW LEVEL
-- SECURITY binds the owner too, and production serves every path through one role that
-- holds neither BYPASSRLS nor superuser (Cloud SQL cannot grant BYPASSRLS at all). Two
-- classes of query legitimately have no `app.org_id` to offer and were therefore matching
-- zero rows in production:
--
--   1. Authentication lookups run *before* a tenant is known — sign-in, tenant-context
--      resolution and password-reset issuance. Blocked, every sign-in failed and every
--      reset email was skipped.
--   2. The worker leases jobs and runs retention/report sweeps *across* tenants. Blocked,
--      no job was ever leased, so no queued notification was ever delivered.
--
-- Both paths are permissive policies gated on a transaction-local GUC, so a query that
-- forgets its tenant filter still fails closed unless it also opts in explicitly.
-- The bootstrap is deliberately SELECT-only and limited to the two identity tables the
-- sign-in path reads; it is reachable from unauthenticated requests. System mode is full
-- access and is reachable only from the worker process (see enableSystemMode()).
--
-- New RLS-enabled tables must add their own system_access policy, exactly as they already
-- add tenant_isolation.
DROP POLICY IF EXISTS auth_bootstrap ON "user";
--> statement-breakpoint
CREATE POLICY auth_bootstrap ON "user"
  FOR SELECT
  USING (current_setting('app.auth_bootstrap', true) = 'on');
--> statement-breakpoint
DROP POLICY IF EXISTS auth_bootstrap ON "membership";
--> statement-breakpoint
CREATE POLICY auth_bootstrap ON "membership"
  FOR SELECT
  USING (current_setting('app.auth_bootstrap', true) = 'on');
--> statement-breakpoint
DO $$
DECLARE
  target text;
BEGIN
  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS system_access ON %I', target);
    EXECUTE format(
      'CREATE POLICY system_access ON %I USING (current_setting(''app.system'', true) = ''on'')'
      || ' WITH CHECK (current_setting(''app.system'', true) = ''on'')',
      target);
  END LOOP;
END $$;
