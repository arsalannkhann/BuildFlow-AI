CREATE TABLE IF NOT EXISTS "attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"report_id" text NOT NULL,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" text NOT NULL,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"subject_ref" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_report" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"report_date" text NOT NULL,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"current_revision_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"report_id" text NOT NULL,
	"field_path" text NOT NULL,
	"transcript_span" jsonb,
	"attachment_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issued_document" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"report_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"version" integer NOT NULL,
	"object_key" text NOT NULL,
	"document_id" text NOT NULL,
	"issued_by" text NOT NULL,
	"template_version" text NOT NULL,
	"superseded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"user_id" text NOT NULL,
	"capabilities" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processing_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"report_id" text NOT NULL,
	"status" text NOT NULL,
	"prompt_version" text,
	"schema_version" text,
	"provider" text,
	"model" text,
	"error_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processing_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"processing_run_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"error_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"client_name" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"address" text,
	"report_cutoff" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"report_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"structured_data" jsonb NOT NULL,
	"summary_internal" text,
	"summary_client_safe" text,
	"transcript" jsonb,
	"created_by" text NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"report_id" text NOT NULL,
	"revision_id" text,
	"actor_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"field_path" text,
	"before_value" jsonb,
	"after_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"display_name" text NOT NULL,
	"role_hint" text NOT NULL
);
