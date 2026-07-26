-- Entity resolution: keep the shortlist, not just the winner.
--
-- `candidates` records what the cascade was choosing between, ranked, and `reason` records
-- the LLM tier's one-line justification. Both exist so the review screen can show HOW a
-- mapping was decided: an unmatched phrase offered with three ranked options is a one-click
-- decision, while a bare "not matched" beside a dropdown of every record on the project is a
-- research task nobody does. `reason` is display-only and is never read back as a value.
--
-- Additive and nullable: every row written before this migration stays valid and readable.
ALTER TABLE "report_entity_link" ADD COLUMN IF NOT EXISTS "candidates" jsonb;--> statement-breakpoint
ALTER TABLE "report_entity_link" ADD COLUMN IF NOT EXISTS "reason" text;--> statement-breakpoint
-- The review screen reads the whole trail for one report every time it opens.
CREATE INDEX IF NOT EXISTS "report_entity_link_report_idx"
  ON "report_entity_link" ("organization_id", "report_id");
