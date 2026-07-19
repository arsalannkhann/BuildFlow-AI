CREATE TABLE IF NOT EXISTS "budget_line" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"budget_id" text NOT NULL,
	"cost_code_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric,
	"unit" text,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cost_code" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cost_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"cost_code_id" text,
	"kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"source_kind" text,
	"source_id" text,
	"entry_date" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"ownership" text DEFAULT 'owned' NOT NULL,
	"supplier_id" text,
	"identifier" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"log_date" text NOT NULL,
	"hours_used" numeric,
	"fuel_litres" numeric,
	"downtime_hours" numeric,
	"note" text,
	"report_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_service" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"name" text NOT NULL,
	"due_date" text,
	"due_hours" numeric,
	"completed_at" timestamp with time zone,
	"completed_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_line" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"description" text NOT NULL,
	"hsn" text,
	"quantity" numeric,
	"unit" text,
	"rate_paise" bigint,
	"tax_rate_bp" integer,
	"amount_paise" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"cost_code_id" text,
	"confidence_band" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"supplier_id" text,
	"invoice_number" text,
	"invoice_date" text,
	"gstin" text,
	"subtotal_paise" bigint,
	"tax_paise" bigint,
	"total_paise" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"object_key" text,
	"file_name" text,
	"content_type" text,
	"byte_size" bigint,
	"checksum" text,
	"ocr_provider" text,
	"ocr_model" text,
	"ocr_schema_version" text,
	"ocr_status" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labour_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"attendance_date" text NOT NULL,
	"contractor_id" text,
	"trade" text NOT NULL,
	"headcount" integer NOT NULL,
	"hours_worked" numeric,
	"location_id" text,
	"activity_id" text,
	"report_id" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labour_contractor" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"name" text NOT NULL,
	"trade" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_receipt_line" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"material_id" text,
	"description_raw" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"rate_paise" bigint,
	"amount_paise" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"confidence_band" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"supplier_id" text,
	"challan_number" text,
	"receipt_date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"note" text,
	"object_key" text,
	"file_name" text,
	"content_type" text,
	"byte_size" bigint,
	"checksum" text,
	"ocr_provider" text,
	"ocr_model" text,
	"ocr_schema_version" text,
	"ocr_status" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"hsn_code" text,
	"reorder_threshold" numeric,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mb_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"mb_number" integer NOT NULL,
	"description" text NOT NULL,
	"activity_id" text,
	"location_id" text,
	"contractor_id" text,
	"measurement_date" text NOT NULL,
	"length" numeric,
	"breadth" numeric,
	"depth" numeric,
	"count" integer,
	"unit" text NOT NULL,
	"quantity" numeric NOT NULL,
	"formula" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"corrects_entry_id" text,
	"superseded_by" text,
	"created_by" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"certified_by" text,
	"certified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mb_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"captured_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"paid_date" text NOT NULL,
	"reference" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "po_line" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"purchase_order_id" text NOT NULL,
	"material_id" text,
	"cost_code_id" text,
	"description" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"rate_paise" bigint NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"rfq_id" text,
	"po_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"exported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfq_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"rfq_id" text NOT NULL,
	"material_id" text,
	"description" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfq_quote" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"rfq_item_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"rate_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"delivery_days" integer,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfq" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"needed_by" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"material_id" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"source_kind" text,
	"source_id" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"gstin" text,
	"phone" text,
	"email" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "material" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "material"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "supplier" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "supplier" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "supplier"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "project_supplier" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "project_supplier" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "project_supplier"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "material_receipt" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "material_receipt" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "material_receipt"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "material_receipt_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "material_receipt_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "material_receipt_line"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "stock_transaction" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock_transaction" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "stock_transaction"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "cost_code" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cost_code" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "cost_code"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "budget" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budget" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "budget"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "budget_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budget_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "budget_line"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invoice"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "invoice_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invoice_line"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "cost_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cost_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "cost_entry"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payment"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "labour_contractor" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "labour_contractor" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "labour_contractor"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "labour_attendance" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "labour_attendance" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "labour_attendance"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "equipment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "equipment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "equipment"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "equipment_assignment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "equipment_assignment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "equipment_assignment"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "equipment_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "equipment_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "equipment_log"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "equipment_service" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "equipment_service" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "equipment_service"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "mb_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mb_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mb_entry"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "mb_evidence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mb_evidence" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mb_evidence"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "rfq" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rfq" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rfq"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "rfq_item" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rfq_item" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rfq_item"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "rfq_quote" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rfq_quote" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rfq_quote"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "purchase_order" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "purchase_order" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "purchase_order"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "po_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "po_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "po_line"
  USING (organization_id = current_setting('app.org_id', true))
  WITH CHECK (organization_id = current_setting('app.org_id', true));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS project_supplier_uq ON "project_supplier" ("project_id", "supplier_id");
--> statement-breakpoint
-- Exactly-once stock application: a retried receipt posting hits this unique and skips.
CREATE UNIQUE INDEX IF NOT EXISTS stock_transaction_source_uq
  ON "stock_transaction" ("source_kind", "source_id") WHERE "source_kind" IS NOT NULL;
--> statement-breakpoint
-- Exactly-once cost posting for approved invoices (and other sourced entries).
CREATE UNIQUE INDEX IF NOT EXISTS cost_entry_source_uq
  ON "cost_entry" ("source_kind", "source_id") WHERE "source_kind" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS budget_project_version_uq ON "budget" ("project_id", "version");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS mb_entry_project_number_uq ON "mb_entry" ("project_id", "mb_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS rfq_quote_item_supplier_uq ON "rfq_quote" ("rfq_item_id", "supplier_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_project_number_uq ON "purchase_order" ("project_id", "po_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS material_receipt_project_status_ix ON "material_receipt" ("project_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stock_transaction_project_material_ix ON "stock_transaction" ("project_id", "material_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cost_entry_project_ix ON "cost_entry" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS labour_attendance_project_date_ix ON "labour_attendance" ("project_id", "attendance_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS equipment_log_equipment_date_ix ON "equipment_log" ("equipment_id", "log_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mb_entry_project_status_ix ON "mb_entry" ("project_id", "status");
