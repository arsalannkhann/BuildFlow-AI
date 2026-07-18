-- RLS defense-in-depth (rules.md §7/§9, Architecture.MD §9).
-- App-layer TenantContext filtering remains the first enforcement layer; these policies are
-- the second net. They bind to the transaction-local GUC `app.org_id` set by withTenant().
-- The `buildflow_app` role exists so request paths can run without table-owner/BYPASSRLS
-- privileges; system paths (migrations, worker lease loop) use the owning role.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'buildflow_app') THEN
    CREATE ROLE buildflow_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO buildflow_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO buildflow_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO buildflow_app;
--> statement-breakpoint
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organization" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "organization"
  USING (id = current_setting('app.org_id', true))
  WITH CHECK (id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "user"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "project" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "project"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "membership" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "membership"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "job" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "job" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "job"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "daily_report" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "daily_report" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "daily_report"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "report_revision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "report_revision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "report_revision"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "attachment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attachment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "attachment"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "evidence_link" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "evidence_link" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "evidence_link"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "processing_run" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "processing_run" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "processing_run"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "processing_stage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "processing_stage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "processing_stage"
  USING (EXISTS (
    SELECT 1 FROM "processing_run" r
    WHERE r.id = processing_run_id
      AND r.organization_id = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "processing_run" r
    WHERE r.id = processing_run_id
      AND r.organization_id = current_setting('app.org_id', true)));
--> statement-breakpoint
ALTER TABLE "review_decision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_decision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "review_decision"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "issued_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "issued_document" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "issued_document"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_event" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_event"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
-- Concurrency safety for append-only records (DEFERRED.md hardening): revision numbers and
-- issued versions must be unique per report even under concurrent writers.
CREATE UNIQUE INDEX IF NOT EXISTS report_revision_report_id_revision_number_uq
  ON "report_revision" ("report_id", "revision_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS issued_document_report_id_version_uq
  ON "issued_document" ("report_id", "version");
