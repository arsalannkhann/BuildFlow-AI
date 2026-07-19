import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { getAiRegistry } from "@buildflow/ai/registry";
import { invoiceExtractionSchema, INVOICE_SCHEMA_VERSION } from "@buildflow/ai/documents/schema";
import { addInvoiceLine, getInvoice, listInvoiceLines, updateInvoice } from "@buildflow/db/queries/invoices";
import { audit } from "@buildflow/db/queries/audit";
import { LocalFsStorage } from "@buildflow/storage/local-fs";

// Invoice OCR: lands DRAFT lines + header suggestions for human review (invoice.review).
// It NEVER posts cost entries — approval is a separate, human, capability-gated action.
// Idempotent for at-least-once delivery (same guards as challan extraction).
export async function runInvoiceExtraction(db: AppDb, ctx: TenantContext, invoiceId: string): Promise<void> {
  const ai = getAiRegistry();
  const invoice = await getInvoice(db, ctx, invoiceId);
  if (!invoice) return;
  if (invoice.status !== "draft") return; // human already reviewed/approved — never interfere
  if ((await listInvoiceLines(db, ctx, invoiceId)).length > 0) return; // replayed job

  const meta = {
    ocrProvider: ai.documents.meta.provider,
    ocrModel: ai.documents.meta.model,
    ocrSchemaVersion: INVOICE_SCHEMA_VERSION,
  };

  if (!invoice.objectKey || !invoice.contentType) {
    await updateInvoice(db, ctx, invoiceId, { ...meta, ocrStatus: "unsupported" });
    return;
  }

  try {
    const imageBytes = await new LocalFsStorage().get(invoice.objectKey);
    const raw = await ai.documents.extractInvoice({ imageBytes, contentType: invoice.contentType });
    if (raw === null) {
      await updateInvoice(db, ctx, invoiceId, { ...meta, ocrStatus: "unsupported" });
      await audit(db, ctx, { action: "invoice.ocr_unsupported", subjectRef: invoiceId, metadata: meta });
      return;
    }
    // Central never-invent gate (rules.md §11): parse before persisting anything.
    const parsed = invoiceExtractionSchema.parse(raw);
    for (const [index, line] of parsed.lines.entries()) {
      await addInvoiceLine(db, ctx, {
        invoiceId, description: line.description, hsn: line.hsn,
        quantity: line.quantity, unit: line.unit,
        ratePaise: line.rate_paise, taxRateBp: line.tax_rate_bp, amountPaise: line.amount_paise,
        confidenceBand: line.confidence_band, sortOrder: index,
      });
    }
    // Header suggestions fill only fields the person left blank — OCR never overwrites.
    await updateInvoice(db, ctx, invoiceId, {
      ...meta, ocrStatus: "succeeded",
      invoiceNumber: invoice.invoiceNumber ?? parsed.invoice_number.value,
      invoiceDate: invoice.invoiceDate ?? parsed.invoice_date.value,
      gstin: invoice.gstin ?? parsed.supplier_gstin.value,
      subtotalPaise: invoice.subtotalPaise ?? parsed.subtotal_paise.value,
      taxPaise: invoice.taxPaise ?? parsed.tax_paise.value,
      totalPaise: invoice.totalPaise ?? parsed.total_paise.value,
    });
    await audit(db, ctx, {
      action: "invoice.ocr_completed", subjectRef: invoiceId,
      metadata: { ...meta, lines: parsed.lines.length },
    });
  } catch (err) {
    await updateInvoice(db, ctx, invoiceId, { ...meta, ocrStatus: "failed" });
    await audit(db, ctx, {
      action: "invoice.ocr_failed", subjectRef: invoiceId,
      metadata: { ...meta, message: err instanceof Error ? err.message.slice(0, 300) : "unknown" },
    });
    throw err; // queue retries with backoff; guards above keep replays safe
  }
}
