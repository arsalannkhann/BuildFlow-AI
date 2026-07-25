CREATE TABLE IF NOT EXISTS "report_entity_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"report_id" text NOT NULL,
	"revision_id" text,
	"field_path" text NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" text,
	"canonical_value" text,
	"raw_text" text NOT NULL,
	"method" text NOT NULL,
	"score" numeric(5, 4),
	"confirmed_at" timestamp with time zone,
	"confirmed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "term_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"kind" text NOT NULL,
	"alias" text NOT NULL,
	"canonical_value" text NOT NULL,
	"canonical_id" text,
	"source" text DEFAULT 'seed' NOT NULL,
	"confirmed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "report_revision" ADD COLUMN "transcript_normalized" jsonb;
--> statement-breakpoint
ALTER TABLE "term_alias" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "term_alias" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "term_alias"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
CREATE POLICY system_access ON "term_alias"
  USING (current_setting('app.system', true) = 'on')
  WITH CHECK (current_setting('app.system', true) = 'on');
--> statement-breakpoint
ALTER TABLE "report_entity_link" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "report_entity_link" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "report_entity_link"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
CREATE POLICY system_access ON "report_entity_link"
  USING (current_setting('app.system', true) = 'on')
  WITH CHECK (current_setting('app.system', true) = 'on');
--> statement-breakpoint
-- One canonical meaning per spoken alias within a scope; project rows override org rows.
CREATE UNIQUE INDEX IF NOT EXISTS term_alias_scope_uq
  ON "term_alias" ("organization_id", COALESCE("project_id", ''), "kind", "alias");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS report_entity_link_report_ix
  ON "report_entity_link" ("report_id", "field_path");
