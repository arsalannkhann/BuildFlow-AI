import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, jsonb, boolean, bigint, doublePrecision, numeric } from "drizzle-orm/pg-core";

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

// --- Phase D: commercial operations (docs/PHASE-D-DESIGN.md) ---
// Money is integer paise + ISO currency code; quantities are numeric strings + unit text;
// dates are ISO YYYY-MM-DD text with the project timezone applied at display (rules.md §7).

export const materials = pgTable("material", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull(), // UCUM-ish code: bag | kg | cum | sqm | nos ...
  hsnCode: text("hsn_code"),
  reorderThreshold: numeric("reorder_threshold"), // shortage alert when current stock < threshold
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts(),
});

export const suppliers = pgTable("supplier", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  gstin: text("gstin"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  createdAt: ts(),
});

export const projectSuppliers = pgTable("project_supplier", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  notes: text("notes"),
  createdAt: ts(),
});

// A delivery challan. draft -> reviewed (human) -> posted. Posting writes stock_transaction
// rows in the same transaction; the partial unique index on (source_kind, source_id) makes
// a retried posting idempotent. OCR only ever fills DRAFT lines — never stock.
export const materialReceipts = pgTable("material_receipt", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  supplierId: text("supplier_id"),
  challanNumber: text("challan_number"),
  receiptDate: text("receipt_date").notNull(),
  status: text("status").notNull().default("draft"), // draft | reviewed | posted
  note: text("note"),
  // challan photo evidence, stored directly (attachment table is report-scoped)
  objectKey: text("object_key"),
  fileName: text("file_name"),
  contentType: text("content_type"),
  byteSize: bigint("byte_size", { mode: "number" }),
  checksum: text("checksum"),
  // OCR provenance (rules.md §11: store provider/model/schema versions)
  ocrProvider: text("ocr_provider"),
  ocrModel: text("ocr_model"),
  ocrSchemaVersion: text("ocr_schema_version"),
  ocrStatus: text("ocr_status"), // queued | succeeded | failed | unsupported (null = no OCR)
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  postedBy: text("posted_by"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const materialReceiptLines = pgTable("material_receipt_line", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  receiptId: text("receipt_id").notNull(),
  materialId: text("material_id"), // mapped by the reviewer; required before posting
  descriptionRaw: text("description_raw").notNull(), // as OCR (or the person) wrote it
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull(),
  ratePaise: bigint("rate_paise", { mode: "number" }),
  amountPaise: bigint("amount_paise", { mode: "number" }),
  currency: text("currency").notNull().default("INR"),
  confidenceBand: text("confidence_band"), // Supported | Check | Missing (null = manual entry)
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
});

// Append-only stock ledger. Current stock is ALWAYS a sum over this table — no mutable
// "current level" column. Sign is derived from kind at query time (adjusted is signed
// as entered).
export const stockTransactions = pgTable("stock_transaction", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  materialId: text("material_id").notNull(),
  kind: text("kind").notNull(), // received | issued | consumed | adjusted | returned
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull(),
  sourceKind: text("source_kind"), // receipt_line | manual | dpr_material
  sourceId: text("source_id"),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// Org-level chart of cost codes (budget + cost entries reference these).
export const costCodes = pgTable("cost_code", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  createdAt: ts(),
});

// Budgets are immutable versions: a revision inserts a new budget (version = prior + 1)
// and marks the prior superseded. Lines are never edited in place.
export const budgets = pgTable("budget", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("active"), // draft | active | superseded
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

export const budgetLines = pgTable("budget_line", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  budgetId: text("budget_id").notNull(),
  costCodeId: text("cost_code_id").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity"),
  unit: text("unit"),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("INR"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
});

// Supplier invoice. draft -> reviewed -> approved (invoice.review). Approval posts
// cost_entry rows exactly once (partial unique on cost_entry source refs).
export const invoices = pgTable("invoice", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  supplierId: text("supplier_id"),
  invoiceNumber: text("invoice_number"),
  invoiceDate: text("invoice_date"),
  gstin: text("gstin"),
  subtotalPaise: bigint("subtotal_paise", { mode: "number" }),
  taxPaise: bigint("tax_paise", { mode: "number" }),
  totalPaise: bigint("total_paise", { mode: "number" }),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("draft"), // draft | reviewed | approved
  objectKey: text("object_key"),
  fileName: text("file_name"),
  contentType: text("content_type"),
  byteSize: bigint("byte_size", { mode: "number" }),
  checksum: text("checksum"),
  ocrProvider: text("ocr_provider"),
  ocrModel: text("ocr_model"),
  ocrSchemaVersion: text("ocr_schema_version"),
  ocrStatus: text("ocr_status"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceLines = pgTable("invoice_line", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  invoiceId: text("invoice_id").notNull(),
  description: text("description").notNull(),
  hsn: text("hsn"),
  quantity: numeric("quantity"),
  unit: text("unit"),
  ratePaise: bigint("rate_paise", { mode: "number" }),
  taxRateBp: integer("tax_rate_bp"), // GST as basis points, e.g. 1800 = 18%
  amountPaise: bigint("amount_paise", { mode: "number" }), // required before approval
  currency: text("currency").notNull().default("INR"),
  costCodeId: text("cost_code_id"),
  confidenceBand: text("confidence_band"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
});

// Append-only actuals. source refs (approved invoice line, attendance calc, manual)
// carry a partial unique index so posting retries are idempotent.
export const costEntries = pgTable("cost_entry", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  costCodeId: text("cost_code_id"),
  kind: text("kind").notNull(), // labour | material | equipment | invoice | other
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("INR"),
  sourceKind: text("source_kind"), // invoice_line | manual | attendance
  sourceId: text("source_id"),
  entryDate: text("entry_date").notNull(),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// Payments are RECORDED, never executed (no money movement in product scope).
export const payments = pgTable("payment", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  invoiceId: text("invoice_id").notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("INR"),
  paidDate: text("paid_date").notNull(),
  reference: text("reference"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// Labour: daily contractor totals only — no individual worker identities, no biometrics.
export const labourContractors = pgTable("labour_contractor", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id"), // null = available org-wide
  name: text("name").notNull(),
  trade: text("trade"),
  createdAt: ts(),
});

export const labourAttendance = pgTable("labour_attendance", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  attendanceDate: text("attendance_date").notNull(),
  contractorId: text("contractor_id"),
  trade: text("trade").notNull(),
  headcount: integer("headcount").notNull(),
  hoursWorked: numeric("hours_worked"),
  locationId: text("location_id"),
  activityId: text("activity_id"),
  reportId: text("report_id"), // optional source DPR
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

export const equipment = pgTable("equipment", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind"), // excavator | mixer | crane | ...
  ownership: text("ownership").notNull().default("owned"), // owned | rented
  supplierId: text("supplier_id"), // rental supplier
  identifier: text("identifier"), // registration / asset number
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts(),
});

export const equipmentAssignments = pgTable("equipment_assignment", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  equipmentId: text("equipment_id").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// Append-only usage log (hours, fuel, downtime) — corrections are new rows.
export const equipmentLogs = pgTable("equipment_log", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  equipmentId: text("equipment_id").notNull(),
  logDate: text("log_date").notNull(),
  hoursUsed: numeric("hours_used"),
  fuelLitres: numeric("fuel_litres"),
  downtimeHours: numeric("downtime_hours"),
  note: text("note"),
  reportId: text("report_id"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// Deterministic service reminders: due_date within N days OR cumulative logged hours
// >= due_hours. No prediction.
export const equipmentServices = pgTable("equipment_service", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  equipmentId: text("equipment_id").notNull(),
  name: text("name").notNull(),
  dueDate: text("due_date"),
  dueHours: numeric("due_hours"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedNote: text("completed_note"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// Measurement Book (e-MB Preview) — NOT legally authoritative. quantity is always
// server-computed from the dimensions (packages/domain/src/mb/calc.ts); the formula
// string is stored with the row. Append-only after certification: a correction inserts a
// new entry with corrects_entry_id and the certified row only ever gains superseded_by.
export const mbEntries = pgTable("mb_entry", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  mbNumber: integer("mb_number").notNull(), // per-project sequence, unique index below
  description: text("description").notNull(),
  activityId: text("activity_id"),
  locationId: text("location_id"),
  contractorId: text("contractor_id"),
  measurementDate: text("measurement_date").notNull(),
  length: numeric("length"),
  breadth: numeric("breadth"),
  depth: numeric("depth"),
  count: integer("count"),
  unit: text("unit").notNull(),
  quantity: numeric("quantity").notNull(), // server-computed, never client-supplied
  formula: text("formula").notNull(), // e.g. "L×B×D×n"
  status: text("status").notNull().default("draft"), // draft | submitted | verified | rejected | certified
  rejectionReason: text("rejection_reason"),
  correctsEntryId: text("corrects_entry_id"),
  supersededBy: text("superseded_by"),
  createdBy: text("created_by").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  certifiedBy: text("certified_by"),
  certifiedAt: timestamp("certified_at", { withTimezone: true }),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Geotagged photo evidence for MB entries. Photo metadata is presented as metadata,
// never guaranteed truth (rules.md §13).
export const mbEvidence = pgTable("mb_evidence", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  entryId: text("entry_id").notNull(),
  objectKey: text("object_key").notNull(),
  fileName: text("file_name"),
  contentType: text("content_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

// RFQ -> manual supplier quotes -> comparison -> PO draft -> approved -> exported.
// POs are NEVER sent automatically; export is a manual CSV/JSON download.
export const rfqs = pgTable("rfq", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"), // open | closed
  neededBy: text("needed_by"),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

export const rfqItems = pgTable("rfq_item", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  rfqId: text("rfq_id").notNull(),
  materialId: text("material_id"),
  description: text("description").notNull(),
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
});

// Quotes are entered MANUALLY per item per supplier (unique index below).
export const rfqQuotes = pgTable("rfq_quote", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  rfqItemId: text("rfq_item_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  ratePaise: bigint("rate_paise", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("INR"),
  deliveryDays: integer("delivery_days"),
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: ts(),
});

export const purchaseOrders = pgTable("purchase_order", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  rfqId: text("rfq_id"),
  poNumber: integer("po_number").notNull(), // per-project sequence, unique index below
  status: text("status").notNull().default("draft"), // draft | approved | exported
  totalPaise: bigint("total_paise", { mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const poLines = pgTable("po_line", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  purchaseOrderId: text("purchase_order_id").notNull(),
  materialId: text("material_id"),
  costCodeId: text("cost_code_id"),
  description: text("description").notNull(),
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull(),
  ratePaise: bigint("rate_paise", { mode: "number" }).notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("INR"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
});


// --- Phase E: notifications (docs/PHASE-E-DESIGN.md) ---
// One row per recipient per event. Titles reference records; bodies stay operational —
// NEVER report narrative, transcripts, or customer content (rules.md §14).

export const notifications = pgTable("notification", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  recipientUserId: text("recipient_user_id").notNull(),
  eventKind: text("event_kind").notNull(), // catalog in @buildflow/notify/catalog
  subjectRef: text("subject_ref").notNull(), // entity id the event is about
  projectId: text("project_id"),
  title: text("title").notNull(),
  body: text("body"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: ts(),
});

// External-channel delivery state. Delivery runs as a `notification.deliver` job on the
// existing queue, so retry/backoff/dead-letter come free (ADR-0003); this row mirrors the
// outcome for the UI ("sent via email", "failed — will retry", "could not be delivered").
export const notificationDeliveries = pgTable("notification_delivery", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  notificationId: text("notification_id").notNull(),
  channel: text("channel").notNull(), // email | whatsapp
  status: text("status").notNull().default("queued"), // queued | sent | failed | dead
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  providerMessageId: text("provider_message_id"),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Per-user per-event per-channel opt in/out. Absent row = catalog default (in-app on for
// everything; email on for review requests, rejections, failures; WhatsApp off).
export const notificationPreferences = pgTable("notification_preference", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  eventKind: text("event_kind").notNull(),
  channel: text("channel").notNull(), // inapp | email | whatsapp
  enabled: boolean("enabled").notNull(),
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
  materials, suppliers, projectSuppliers, materialReceipts, materialReceiptLines, stockTransactions,
  costCodes, budgets, budgetLines, invoices, invoiceLines, costEntries, payments,
  labourContractors, labourAttendance, equipment, equipmentAssignments, equipmentLogs, equipmentServices,
  mbEntries, mbEvidence,
  rfqs, rfqItems, rfqQuotes, purchaseOrders, poLines,
  notifications, notificationDeliveries, notificationPreferences,
  dailyReports, reportRevisions,
  attachments, evidenceLinks, processingRuns, processingStages, reviewDecisions,
  issuedDocuments, auditEvents,
};
