import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, jsonb, boolean, bigint } from "drizzle-orm/pg-core";

const ts = (name = "created_at") => timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: ts(),
});

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  displayName: text("display_name").notNull(),
  roleHint: text("role_hint").notNull(),
});

export const projects = pgTable("project", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  clientName: text("client_name"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  address: text("address"),
  reportCutoff: text("report_cutoff"),
});

export const memberships = pgTable("membership", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id"),
  userId: text("user_id").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull(),
});

export const dailyReports = pgTable("daily_report", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  reportDate: text("report_date").notNull(),
  status: text("status").notNull(),
  createdBy: text("created_by").notNull(),
  currentRevisionId: text("current_revision_id"),
  note: text("note"),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reportRevisions = pgTable("report_revision", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  reportId: text("report_id").notNull(),
  revisionNumber: integer("revision_number").notNull(),
  structuredData: jsonb("structured_data").notNull(),
  summaryInternal: text("summary_internal"),
  summaryClientSafe: text("summary_client_safe"),
  transcript: jsonb("transcript"),
  createdBy: text("created_by").notNull(),
  isAiGenerated: boolean("is_ai_generated").notNull().default(false),
  createdAt: ts(),
});

export const attachments = pgTable("attachment", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  reportId: text("report_id").notNull(),
  kind: text("kind").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  createdAt: ts(),
});

export const evidenceLinks = pgTable("evidence_link", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  reportId: text("report_id").notNull(),
  fieldPath: text("field_path").notNull(),
  transcriptSpan: jsonb("transcript_span").$type<{ startMs: number; endMs: number } | null>(),
  attachmentId: text("attachment_id"),
});

export const processingRuns = pgTable("processing_run", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  reportId: text("report_id").notNull(),
  status: text("status").notNull(),
  promptVersion: text("prompt_version"),
  schemaVersion: text("schema_version"),
  provider: text("provider"),
  model: text("model"),
  errorCategory: text("error_category"),
  startedAt: ts("started_at"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const processingStages = pgTable("processing_stage", {
  id: text("id").primaryKey(),
  processingRunId: text("processing_run_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  attempt: integer("attempt").notNull().default(0),
  errorCategory: text("error_category"),
  startedAt: ts("started_at"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const reviewDecisions = pgTable("review_decision", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  reportId: text("report_id").notNull(),
  revisionId: text("revision_id"),
  actorId: text("actor_id").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason"),
  fieldPath: text("field_path"),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  createdAt: ts(),
});

export const issuedDocuments = pgTable("issued_document", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  reportId: text("report_id").notNull(),
  revisionId: text("revision_id").notNull(),
  version: integer("version").notNull(),
  objectKey: text("object_key").notNull(),
  documentId: text("document_id").notNull(),
  issuedBy: text("issued_by").notNull(),
  templateVersion: text("template_version").notNull(),
  supersededBy: text("superseded_by"),
  issuedAt: ts("issued_at"),
});

export const auditEvents = pgTable("audit_event", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id"),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  subjectRef: text("subject_ref").notNull(),
  metadata: jsonb("metadata"),
  createdAt: ts(),
});

export const schema = {
  organizations, users, projects, memberships, dailyReports, reportRevisions,
  attachments, evidenceLinks, processingRuns, processingStages, reviewDecisions,
  issuedDocuments, auditEvents,
};
