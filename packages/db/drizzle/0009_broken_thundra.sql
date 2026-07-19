-- pgvector powers optional semantic ranking (Phase E3). PGlite bundles the extension
-- (loaded in client.ts); real PostgreSQL uses pgvector-enabled images (docker-compose,
-- CI service, Supabase). Lexical search never depends on it.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_document" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"record_status" text NOT NULL,
	"record_date" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_embedding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"search_document_id" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_embedding_search_document_id_unique" UNIQUE("search_document_id")
);
--> statement-breakpoint
ALTER TABLE "search_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "search_document" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "search_document"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "search_embedding" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "search_embedding" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "search_embedding"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
-- One projection row per source record; upserts target this index.
CREATE UNIQUE INDEX IF NOT EXISTS search_document_ref_uq
  ON "search_document" ("organization_id", "kind", "ref_id");
--> statement-breakpoint
-- The expression matches queries/search.ts exactly so Postgres can use the index.
CREATE INDEX IF NOT EXISTS search_document_fts_idx ON "search_document" USING gin (
  to_tsvector('english', coalesce("title", '') || ' ' || coalesce("body", ''))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS search_document_project_ix
  ON "search_document" ("organization_id", "project_id", "kind");
--> statement-breakpoint
-- ANN index for cosine similarity (used by real-PG semantic ranking; harmless in PGlite).
CREATE INDEX IF NOT EXISTS search_embedding_hnsw_idx
  ON "search_embedding" USING hnsw ("embedding" vector_cosine_ops);
