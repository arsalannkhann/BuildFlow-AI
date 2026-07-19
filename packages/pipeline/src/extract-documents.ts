import type { AppDb } from "@buildflow/db/client";
import type { TenantContext } from "@buildflow/domain/tenancy";
import { getAiRegistry } from "@buildflow/ai/registry";
import { challanSchema, CHALLAN_SCHEMA_VERSION } from "@buildflow/ai/documents/schema";
import {
  addReceiptLine, getReceipt, listReceiptLines, updateReceipt,
} from "@buildflow/db/queries/materials";
import { audit } from "@buildflow/db/queries/audit";
import { LocalFsStorage } from "@buildflow/storage/local-fs";

// Challan OCR: reads the uploaded photo and lands DRAFT receipt lines for human review.
// This job NEVER touches stock — posting is a separate, human, capability-gated action.
// Idempotent for at-least-once delivery: a replay on a receipt that already has lines
// (or that a human has already moved past draft) is a no-op.
export async function runChallanExtraction(db: AppDb, ctx: TenantContext, receiptId: string): Promise<void> {
  const ai = getAiRegistry();
  const receipt = await getReceipt(db, ctx, receiptId);
  if (!receipt) return; // receipt deleted meanwhile — nothing to do
  if (receipt.status !== "draft") return; // human already reviewed/posted — never interfere
  if ((await listReceiptLines(db, ctx, receiptId)).length > 0) return; // replayed job

  const meta = {
    ocrProvider: ai.documents.meta.provider,
    ocrModel: ai.documents.meta.model,
    ocrSchemaVersion: CHALLAN_SCHEMA_VERSION,
  };

  if (!receipt.objectKey || !receipt.contentType) {
    await updateReceipt(db, ctx, receiptId, { ...meta, ocrStatus: "unsupported" });
    return;
  }

  try {
    const imageBytes = await new LocalFsStorage().get(receipt.objectKey);
    const raw = await ai.documents.extractChallan({ imageBytes, contentType: receipt.contentType });
    if (raw === null) {
      await updateReceipt(db, ctx, receiptId, { ...meta, ocrStatus: "unsupported" });
      await audit(db, ctx, { action: "material.receipt_ocr_unsupported", subjectRef: receiptId, metadata: meta });
      return;
    }
    // Central never-invent gate: validate regardless of provider so the invariant does not
    // depend on each port implementation remembering to parse (rules.md §11).
    const parsed = challanSchema.parse(raw);
    for (const [index, line] of parsed.lines.entries()) {
      await addReceiptLine(db, ctx, {
        receiptId,
        descriptionRaw: line.description_raw,
        // Unknown quantity/unit land as visible placeholders the reviewer MUST fix before
        // the receipt can be marked reviewed (posting validates them again).
        quantity: line.quantity ?? "0",
        unit: line.unit ?? "",
        ratePaise: line.rate_paise, amountPaise: line.amount_paise,
        confidenceBand: line.confidence_band, sortOrder: index,
      });
    }
    await updateReceipt(db, ctx, receiptId, {
      ...meta, ocrStatus: "succeeded",
      challanNumber: receipt.challanNumber ?? parsed.challan_number.value,
    });
    await audit(db, ctx, {
      action: "material.receipt_ocr_completed", subjectRef: receiptId,
      metadata: { ...meta, lines: parsed.lines.length },
    });
  } catch (err) {
    await updateReceipt(db, ctx, receiptId, { ...meta, ocrStatus: "failed" });
    await audit(db, ctx, {
      action: "material.receipt_ocr_failed", subjectRef: receiptId,
      metadata: { ...meta, message: err instanceof Error ? err.message.slice(0, 300) : "unknown" },
    });
    throw err; // let the queue retry/backoff; lines-exist guard keeps replays safe
  }
}
