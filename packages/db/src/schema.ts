import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, jsonb, boolean, bigint, doublePrecision } from "drizzle-orm/pg-core";

const ts = (name = "created_at") => timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  createdAt: ts(),
});

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  displayName: text("display_name").notNull(),
  roleHint: text("role_hint").notNull(),
  email: text("email").unique(),
  isActive: boolean("is_active").notNull().default(true),
});

// Dev-credential auth (AuthPort "dev" adapter). Supabase Auth replaces this table's role
// in production; user rows remain the identity anchor either way.
export const authCredentials = pgTable("auth_credential", {
  userId: text("user_id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Server-side sessions: the cookie holds an opaque token; we store only its SHA-256 hash.
export const sessions = pgTable("session", {
  id: text("id").primaryKey(), // sha256(token)
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: ts(),
});

export const projects = pgTable("project", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  clientName: text("client_name"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  address: text("address"),
  reportCutoff: text("report_cutoff"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  reportTemplate: text("report_template"),
  defaultRecipients: jsonb("default_recipients").$type<string[]>(),
});

export const memberships = pgTable("membership", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id"),
  userId: text("user_id").notNull(),
  role: text("role"),
  capabilities: jsonb("capabilities").$type<string[]>().notNull(),
});

// Transactional outbox + durable job queue in one table (ADR-0003): enqueue in the same
// transaction as the domain change; the worker leases with FOR UPDATE SKIP LOCKED. The
// Cloud Tasks adapter later dispatches from this same table.
export const jobs = pgTable("job", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status").notNull().default("queued"), // queued | leased | succeeded | failed | dead
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
  leasedUntil: timestamp("leased_until", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});


// --- Phase B: project structure, invitations, client links ---

// Project hierarchy: site -> building -> zone -> floor -> room. Rows form a tree via
// parent_id; kind is informational (labels differ across sites), depth is not enforced.
export const locations = pgTable("location", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  parentId: text("parent_id"),
  kind: text("kind").notNull(), // site | building | zone | floor | room
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
});

export const activities = pgTable("activity", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  unit: text("unit"),
  locationId: text("location_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
});

// Invitations by email or mobile; the raw token is mailed/messaged, only its hash is stored.
export const invitations = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id"),
  email: text("email"),
  mobile: text("mobile"),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending | accepted | revoked | expired
  invitedBy: text("invited_by").notNull(),
  acceptedUserId: text("accepted_user_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: ts(),
});

// Secure expiring client links to one issued document (rules.md §16: revocable, scoped,
// expiring). The raw token appears only in the shared URL; we store its hash.
export const clientLinks = pgTable("client_link", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  reportId: text("report_id").notNull(),
  issuedDocumentId: text("issued_document_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});


// --- Phase C: project controls ---

// Schedule items and milestones. Progress is MANUAL (rules.md §11: no invented
// percentages); every change lands in progress_update with optional evidence links.
export const scheduleItems = pgTable("schedule_item", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  activityId: text("activity_id"),
  name: text("name").notNull(),
  isMilestone: boolean("is_milestone").notNull().default(false),
  baselineStart: text("baseline_start"), // ISO dates; project tz applies for display
  baselineEnd: text("baseline_end"),
  currentStart: text("current_start"),
  currentEnd: text("current_end"),
  progressPercent: integer("progress_percent").notNull().default(0),
  status: text("status").notNull().default("planned"), // planned | in_progress | complete | on_hold
  ownerName: text("owner_name"),
  ownerUserId: text("owner_user_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scheduleDependencies = pgTable("schedule_dependency", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  predecessorId: text("predecessor_id").notNull(),
  successorId: text("successor_id").notNull(),
  createdAt: ts(),
});

// Append-only progress history with evidence (approved DPR and/or photo attachment).
export const progressUpdates = pgTable("progress_update", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  scheduleItemId: text("schedule_item_id").notNull(),
  percent: integer("percent").notNull(),
  note: text("note"),
  reportId: text("report_id"),
  attachmentId: text("attachment_id"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// First-class blockers (DPR-extracted blockers link back via report_id).
export const blockers = pgTable("blocker", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull().default("medium"), // low | medium | high | critical
  status: text("status").notNull().default("open"), // open | in_progress | resolved
  ownerName: text("owner_name"),
  ownerUserId: text("owner_user_id"),
  dueDate: text("due_date"),
  reportId: text("report_id"),
  scheduleItemId: text("schedule_item_id"),
  resolutionNote: text("resolution_note"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rfis = pgTable("rfi", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  number: integer("number").notNull(), // per-project sequence, unique index below
  subject: text("subject").notNull(),
  question: text("question").notNull(),
  status: text("status").notNull().default("open"), // open | answered | closed
  assigneeName: text("assignee_name"),
  assigneeUserId: text("assignee_user_id"),
  dueDate: text("due_date"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Append-only RFI thread; optional uploaded file stored directly (not report-scoped).
export const rfiResponses = pgTable("rfi_response", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  rfiId: text("rfi_id").notNull(),
  body: text("body").notNull(),
  objectKey: text("object_key"),
  fileName: text("file_name"),
  contentType: text("content_type"),
  byteSize: bigint("byte_size", { mode: "number" }),
  checksum: text("checksum"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// Drawing and document register; revisions are append-only, current pointer moves forward.
export const documents = pgTable("document", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  docNumber: text("doc_number"),
  discipline: text("discipline"),
  category: text("category").notNull().default("drawing"), // drawing | specification | contract | other
  currentRevisionId: text("current_revision_id"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

export const documentRevisions = pgTable("document_revision", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  documentId: text("document_id").notNull(),
  revisionLabel: text("revision_label").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("issued"), // issued | superseded
  objectKey: text("object_key"),
  fileName: text("file_name"),
  contentType: text("content_type"),
  byteSize: bigint("byte_size", { mode: "number" }),
  checksum: text("checksum"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// Daily link between an approved DPR's work items and schedule activities.
export const reportActivityLinks = pgTable("report_activity_link", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  reportId: text("report_id").notNull(),
  scheduleItemId: text("schedule_item_id").notNull(),
  workItemIndex: integer("work_item_index"),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
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
  // Mobile offline sync: the device-generated report id makes resubmission idempotent
  // (unique per org+creator, enforced by partial unique index in migration 0003).
  clientReportId: text("client_report_id"),
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
  // Mobile sync: device-generated id for idempotent manifest upserts; uploadedAt is set
  // once the object content is stored and checksum-verified (null = still expected).
  clientAttachmentId: text("client_attachment_id"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
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
  organizations, users, authCredentials, sessions, projects, memberships, jobs,
  locations, activities, invitations, clientLinks,
  scheduleItems, scheduleDependencies, progressUpdates, blockers, rfis, rfiResponses,
  documents, documentRevisions, reportActivityLinks,
  dailyReports, reportRevisions,
  attachments, evidenceLinks, processingRuns, processingStages, reviewDecisions,
  issuedDocuments, auditEvents,
};
