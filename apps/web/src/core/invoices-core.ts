import type { AppDb } from "@buildflow/db/client";
import type { StoragePort } from "@buildflow/storage/port";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { assertCan, can } from "@buildflow/domain/tenancy";
import { newId } from "@buildflow/domain/ids";
import { isDecimalString, normalizeDecimal } from "@buildflow/domain/decimal";
import {
  addCostEntry, addInvoice, addInvoiceLine, addPayment, getInvoice, getInvoiceLine,
  listInvoiceLines, removeInvoiceLine, updateInvoice, updateInvoiceLine,
} from "@buildflow/db/queries/invoices";
import { getCostCode } from "@buildflow/db/queries/budgets";
import { audit } from "@buildflow/db/queries/audit";
import { emitEvent } from "@/core/notifications-core";
import { projectInvoiceDocument } from "@/core/search-core";
import { enqueueJob } from "@buildflow/jobs/queue";
import { drainJobs } from "@buildflow/jobs/runner";
import { pipelineJobRegistry, DOCUMENT_EXTRACT_JOB } from "@buildflow/pipeline/jobs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const inlineJobs = () => (process.env.JOBS_MODE ?? "inline") !== "worker";

// Site staff (material.manage) photograph and file invoices; accountants (invoice.review)
// also enter them directly.
const assertCanEnter = (ctx: TenantContext) => {
  if (!can(ctx, "material.manage") && !can(ctx, "invoice.review")) {
    throw new Error("Action not permitted: material.manage or invoice.review");
  }
};

export async function createInvoice(db: AppDb, storage: StoragePort, ctx: TenantContext, input: {
  projectId: string; supplierId?: string | null; invoiceNumber?: string | null;
  invoiceDate?: string | null;
  photo?: { bytes: Uint8Array; fileName: string; contentType: string };
}): Promise<string> {
  assertCanEnter(ctx);
  if (input.invoiceDate && !DATE_RE.test(input.invoiceDate)) throw new Error("Invoice date must be YYYY-MM-DD");

  const invoiceId = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    let file;
    if (input.photo) {
      const objectKey = `org/${ctx.organizationId}/invoice/${newId()}`;
      const meta = await storage.put(objectKey, input.photo.bytes, input.photo.contentType);
      file = {
        objectKey, fileName: input.photo.fileName, contentType: input.photo.contentType,
        byteSize: meta.byteSize, checksum: meta.checksum,
      };
    }
    const invoice = await addInvoice(tx, ctx, {
      projectId: input.projectId, supplierId: input.supplierId ?? null,
      invoiceNumber: input.invoiceNumber ?? null, invoiceDate: input.invoiceDate ?? null,
      file, ocrStatus: file ? "queued" : null,
    });
    if (file) {
      await enqueueJob(tx, {
        organizationId: ctx.organizationId,
        kind: DOCUMENT_EXTRACT_JOB,
        payload: {
          documentKind: "invoice", invoiceId: invoice.id,
          projectId: input.projectId, userId: ctx.userId,
        },
        idempotencyKey: `${DOCUMENT_EXTRACT_JOB}:invoice:${invoice.id}`,
      });
    }
    await audit(tx, ctx, { action: "invoice.created", subjectRef: invoice.id, metadata: { hasPhoto: Boolean(file) } });
    return invoice.id;
  });

  if (inlineJobs()) await drainJobs(db, pipelineJobRegistry);
  // Phase E1 hook: accountants (invoice.review) learn a draft invoice needs review.
  await emitEvent(db, ctx, { eventKind: "invoice.awaiting_review", subjectRef: invoiceId, projectId: input.projectId, title: `Invoice ${input.invoiceNumber?.trim() || "(number pending review)"} awaits review` });
  return invoiceId;
}

const assertEditableInvoice = async (db: AppDb, ctx: TenantContext, invoiceId: string) => {
  const invoice = await getInvoice(db, ctx, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "approved") throw new Error("An approved invoice is append-only");
  return invoice;
};

export async function addManualInvoiceLine(db: AppDb, ctx: TenantContext, input: {
  invoiceId: string; description: string; quantity?: string | null; unit?: string | null;
  ratePaise?: number | null; taxRateBp?: number | null; amountPaise?: number | null;
  costCodeId?: string | null;
}): Promise<void> {
  assertCanEnter(ctx);
  await assertEditableInvoice(db, ctx, input.invoiceId);
  if (!input.description?.trim()) throw new Error("Description is required");
  if (input.quantity && !isDecimalString(input.quantity)) throw new Error("Quantity must be a decimal number");
  await addInvoiceLine(db, ctx, {
    ...input, description: input.description.trim(),
    quantity: input.quantity ? normalizeDecimal(input.quantity) : null,
  });
}

export async function editInvoiceLine(db: AppDb, ctx: TenantContext, lineId: string, patch: {
  amountPaise?: number | null; costCodeId?: string | null; taxRateBp?: number | null;
}): Promise<void> {
  assertCanEnter(ctx);
  const line = await getInvoiceLine(db, ctx, lineId);
  if (!line) throw new Error("Invoice line not found");
  await assertEditableInvoice(db, ctx, line.invoiceId);
  if (patch.costCodeId) {
    if (!(await getCostCode(db, ctx, patch.costCodeId))) throw new Error("Cost code not found");
  }
  await updateInvoiceLine(db, ctx, lineId, {
    ...(patch.amountPaise !== undefined ? { amountPaise: patch.amountPaise } : {}),
    ...(patch.costCodeId !== undefined ? { costCodeId: patch.costCodeId || null } : {}),
    ...(patch.taxRateBp !== undefined ? { taxRateBp: patch.taxRateBp } : {}),
  });
}

export async function deleteInvoiceLine(db: AppDb, ctx: TenantContext, lineId: string): Promise<void> {
  assertCanEnter(ctx);
  const line = await getInvoiceLine(db, ctx, lineId);
  if (!line) throw new Error("Invoice line not found");
  await assertEditableInvoice(db, ctx, line.invoiceId);
  await removeInvoiceLine(db, ctx, lineId);
}

export async function updateInvoiceHeader(db: AppDb, ctx: TenantContext, invoiceId: string, patch: {
  invoiceNumber?: string | null; invoiceDate?: string | null; supplierId?: string | null;
  subtotalPaise?: number | null; taxPaise?: number | null; totalPaise?: number | null;
}): Promise<void> {
  assertCanEnter(ctx);
  await assertEditableInvoice(db, ctx, invoiceId);
  if (patch.invoiceDate && !DATE_RE.test(patch.invoiceDate)) throw new Error("Invoice date must be YYYY-MM-DD");
  await updateInvoice(db, ctx, invoiceId, patch);
}

// Human review gate (invoice.review): header + every line amount must be present.
// An OCR confidence band never bypasses this (rules.md §11).
export async function markInvoiceReviewed(db: AppDb, ctx: TenantContext, invoiceId: string): Promise<void> {
  assertCan(ctx, "invoice.review");
  const invoice = await getInvoice(db, ctx, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "reviewed") return;
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be reviewed");
  if (!invoice.invoiceNumber?.trim()) throw new Error("Invoice number is required");
  if (!invoice.invoiceDate || !DATE_RE.test(invoice.invoiceDate)) throw new Error("Invoice date is required (YYYY-MM-DD)");
  const lines = await listInvoiceLines(db, ctx, invoiceId);
  if (lines.length === 0) throw new Error("Add at least one line before review");
  for (const line of lines) {
    if (line.amountPaise == null) throw new Error(`Line "${line.description}" needs an amount`);
  }
  await updateInvoice(db, ctx, invoiceId, { status: "reviewed", reviewedBy: ctx.userId, reviewedAt: new Date() });
  await audit(db, ctx, { action: "invoice.reviewed", subjectRef: invoiceId, metadata: { lines: lines.length } });
}

// Approval posts cost entries EXACTLY ONCE: entries and the status flip share one
// transaction, and each entry carries (source_kind='invoice_line', source_id=line.id)
// under a unique index — approving again (or a crash-retry) is a no-op.
export async function approveInvoice(db: AppDb, ctx: TenantContext, invoiceId: string): Promise<void> {
  assertCan(ctx, "invoice.review");
  const invoice = await getInvoice(db, ctx, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "approved") return; // idempotent
  if (invoice.status !== "reviewed") throw new Error("An invoice must be reviewed before approval");
  const lines = await listInvoiceLines(db, ctx, invoiceId);
  const entryDate = invoice.invoiceDate ?? new Date().toISOString().slice(0, 10);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as AppDb;
    for (const line of lines) {
      if (line.amountPaise == null) throw new Error("Every line needs an amount before approval");
      await addCostEntry(tx, ctx, {
        projectId: invoice.projectId, kind: "invoice", amountPaise: line.amountPaise,
        costCodeId: line.costCodeId ?? null, entryDate,
        sourceKind: "invoice_line", sourceId: line.id,
        note: invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : null,
      });
    }
    await updateInvoice(tx, ctx, invoiceId, { status: "approved", approvedBy: ctx.userId, approvedAt: new Date() });
    await audit(tx, ctx, { action: "invoice.approved", subjectRef: invoiceId, metadata: { lines: lines.length } });
  });
  await projectInvoiceDocument(db, ctx, invoiceId); // Phase E3 hook: approved invoice enters search
}

// Payments are RECORDED against approved invoices — the product never moves money.
export async function recordPayment(db: AppDb, ctx: TenantContext, input: {
  invoiceId: string; amountPaise: number; paidDate: string; reference?: string | null;
}): Promise<void> {
  assertCan(ctx, "invoice.review");
  const invoice = await getInvoice(db, ctx, input.invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "approved") throw new Error("Record payments only against approved invoices");
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new Error("Amount must be positive");
  if (!DATE_RE.test(input.paidDate)) throw new Error("Paid date must be YYYY-MM-DD");
  await addPayment(db, ctx, {
    projectId: invoice.projectId, invoiceId: invoice.id,
    amountPaise: input.amountPaise, paidDate: input.paidDate, reference: input.reference ?? null,
  });
  await audit(db, ctx, { action: "invoice.payment_recorded", subjectRef: invoice.id, metadata: { amountPaise: input.amountPaise } });
}
