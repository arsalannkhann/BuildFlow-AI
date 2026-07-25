ALTER TABLE "daily_report" ADD COLUMN "dpr_number" integer;
--> statement-breakpoint
-- A DPR number is referenced in correspondence and claims: it must be unique per project.
-- Partial index so unissued reports (null) do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS daily_report_project_dpr_number_uq
  ON "daily_report" ("project_id", "dpr_number")
  WHERE "dpr_number" IS NOT NULL;
