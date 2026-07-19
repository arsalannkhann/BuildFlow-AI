-- Token-authenticated public entry (companion to 0013_preauth_and_system_rls_paths).
--
-- Invitation acceptance and client share links are reached by an unguessable token, before
-- any organization is known — the token IS the credential, and the row it resolves to is
-- what reveals the tenant. Like the sign-in lookup, these queries have no `app.org_id` to
-- offer, so under FORCE ROW LEVEL SECURITY they matched zero rows: every invitation link
-- reported "not valid" and every client report link reported "not available".
--
-- Scope is deliberately the two token-holder tables only, SELECT-only, because this path is
-- reachable by anyone holding a URL. Once the row resolves it carries organization_id, and
-- every follow-on read and the whole acceptance write run under withTenant() as normal.
DROP POLICY IF EXISTS public_token ON "invitation";
--> statement-breakpoint
CREATE POLICY public_token ON "invitation"
  FOR SELECT
  USING (current_setting('app.public_token', true) = 'on');
--> statement-breakpoint
DROP POLICY IF EXISTS public_token ON "client_link";
--> statement-breakpoint
CREATE POLICY public_token ON "client_link"
  FOR SELECT
  USING (current_setting('app.public_token', true) = 'on');
