ALTER TABLE "attachment" ADD COLUMN "client_attachment_id" text;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS attachment_client_attachment_id_uq
  ON "attachment" ("report_id", "client_attachment_id")
  WHERE "client_attachment_id" IS NOT NULL;
