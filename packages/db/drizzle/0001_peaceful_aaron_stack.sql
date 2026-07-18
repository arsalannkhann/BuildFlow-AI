CREATE TABLE IF NOT EXISTS "auth_credential" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "settings" jsonb;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "report_template" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "default_recipients" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_unique" UNIQUE("email");