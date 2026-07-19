CREATE TABLE IF NOT EXISTS "compliance_export" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"version" integer NOT NULL,
	"object_key" text NOT NULL,
	"checksum" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_pack" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"legal_caution" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_requirement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"requirement_text" text NOT NULL,
	"owner_name" text,
	"due_date" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"satisfied_by_kind" text,
	"satisfied_by_ref" text,
	"note" text,
	"satisfied_by" text,
	"satisfied_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_pack" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "compliance_pack" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "compliance_pack"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "compliance_requirement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "compliance_requirement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "compliance_requirement"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "compliance_export" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "compliance_export" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "compliance_export"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "compliance_pack" ADD CONSTRAINT compliance_pack_kind_ck
  CHECK (kind IN ('dpcc_dust', 'grap', 'rera_quarterly', 'custom'));
--> statement-breakpoint
ALTER TABLE "compliance_pack" ADD CONSTRAINT compliance_pack_status_ck
  CHECK (status IN ('draft', 'in_review', 'reviewed', 'exported'));
--> statement-breakpoint
ALTER TABLE "compliance_pack" ADD CONSTRAINT compliance_pack_period_ck
  CHECK (period_start <= period_end);
--> statement-breakpoint
ALTER TABLE "compliance_requirement" ADD CONSTRAINT compliance_requirement_status_ck
  CHECK (status IN ('pending', 'satisfied', 'not_applicable'));
--> statement-breakpoint
ALTER TABLE "compliance_requirement" ADD CONSTRAINT compliance_requirement_evidence_kind_ck
  CHECK (satisfied_by_kind IS NULL OR satisfied_by_kind IN ('report', 'attachment', 'document', 'mb_entry', 'note'));
--> statement-breakpoint
CREATE INDEX compliance_pack_project_ix
  ON "compliance_pack" ("organization_id", "project_id", "created_at");
--> statement-breakpoint
CREATE INDEX compliance_requirement_pack_ix
  ON "compliance_requirement" ("organization_id", "pack_id", "sort_order");
--> statement-breakpoint
CREATE INDEX compliance_requirement_due_ix
  ON "compliance_requirement" ("organization_id", "due_date", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX compliance_export_pack_version_uq
  ON "compliance_export" ("organization_id", "pack_id", "version");
--> statement-breakpoint
CREATE UNIQUE INDEX compliance_export_object_key_uq
  ON "compliance_export" ("object_key");
