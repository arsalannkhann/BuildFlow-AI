CREATE TABLE IF NOT EXISTS "deletion_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_hash" text NOT NULL,
	"requested_by_hash" text NOT NULL,
	"approved_by_hash" text NOT NULL,
	"deleted_rows" integer NOT NULL,
	"deleted_objects" integer NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_export" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"object_key" text,
	"checksum" text,
	"byte_size" bigint,
	"error_category" text,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_bucket" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "plan" text DEFAULT 'starter' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_status" text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "retention_days" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deletion_execute_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deletion_requested_by" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deletion_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deletion_approved_by" text;
--> statement-breakpoint
ALTER TABLE "organization_export" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organization_export" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "organization_export"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT organization_plan_ck
  CHECK (plan IN ('starter', 'professional', 'enterprise'));
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT organization_billing_status_ck
  CHECK (billing_status IN ('trial', 'active', 'past_due', 'paused'));
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT organization_retention_days_ck
  CHECK (retention_days IS NULL OR retention_days BETWEEN 30 AND 3650);
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT organization_deletion_two_person_ck
  CHECK (deletion_approved_by IS NULL OR deletion_requested_by IS DISTINCT FROM deletion_approved_by);
--> statement-breakpoint
ALTER TABLE "organization_export" ADD CONSTRAINT organization_export_status_ck
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));
--> statement-breakpoint
CREATE UNIQUE INDEX rate_limit_bucket_uq
  ON "rate_limit_bucket" ("scope", "key_hash", "window_start");
--> statement-breakpoint
CREATE INDEX rate_limit_expiry_ix ON "rate_limit_bucket" ("expires_at");
--> statement-breakpoint
CREATE INDEX organization_export_org_ix
  ON "organization_export" ("organization_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX organization_export_object_key_uq
  ON "organization_export" ("object_key") WHERE object_key IS NOT NULL;
--> statement-breakpoint
-- Audit history is append-only for the production app role. Migrations/operators retain
-- owner privileges for documented retention and incident procedures.
REVOKE UPDATE, DELETE ON "audit_event" FROM buildflow_app;
--> statement-breakpoint
REVOKE ALL ON "deletion_receipt" FROM buildflow_app;
