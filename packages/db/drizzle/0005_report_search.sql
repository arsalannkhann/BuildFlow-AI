-- Lexical search over approved report content (PRD FR-012). The expression index matches
-- the query expression in queries/search.ts exactly so Postgres can use it.
CREATE INDEX IF NOT EXISTS report_revision_fts_idx ON "report_revision" USING gin (
  to_tsvector('english',
    coalesce("summary_internal", '') || ' ' || coalesce("transcript"->>'text', ''))
);
