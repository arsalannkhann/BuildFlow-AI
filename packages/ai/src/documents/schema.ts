import { z } from "zod";

// Versioned schemas for commercial-document OCR (docs/PHASE-D-DESIGN.md). Every field
// carries a confidence band; unknown values are null — the model must never invent a
// quantity, rate, or GSTIN (rules.md §11). A confidence band never bypasses human review:
// extraction output only ever lands as DRAFT lines.

export const documentConfidenceBand = z.enum(["Supported", "Check", "Missing"]);
export type DocumentConfidenceBand = z.infer<typeof documentConfidenceBand>;

const textField = z.object({
  value: z.string().nullable(),
  confidence_band: documentConfidenceBand,
});
const paiseField = z.object({
  value: z.number().int().nullable(), // integer paise
  confidence_band: documentConfidenceBand,
});

export const CHALLAN_SCHEMA_VERSION = "challan.v1" as const;

export const challanSchema = z.object({
  schema_version: z.literal(CHALLAN_SCHEMA_VERSION),
  supplier_name: textField,
  challan_number: textField,
  receipt_date: textField, // YYYY-MM-DD or null
  lines: z.array(z.object({
    description_raw: z.string(), // verbatim as printed/written on the challan
    quantity: z.string().nullable(), // decimal string, never a float
    unit: z.string().nullable(),
    rate_paise: z.number().int().nullable(),
    amount_paise: z.number().int().nullable(),
    confidence_band: documentConfidenceBand,
  })),
});
export type ChallanExtraction = z.infer<typeof challanSchema>;

export const INVOICE_SCHEMA_VERSION = "invoice.v1" as const;

export const invoiceExtractionSchema = z.object({
  schema_version: z.literal(INVOICE_SCHEMA_VERSION),
  supplier_name: textField,
  supplier_gstin: textField,
  invoice_number: textField,
  invoice_date: textField, // YYYY-MM-DD or null
  subtotal_paise: paiseField,
  tax_paise: paiseField,
  total_paise: paiseField,
  lines: z.array(z.object({
    description: z.string(),
    hsn: z.string().nullable(),
    quantity: z.string().nullable(),
    unit: z.string().nullable(),
    rate_paise: z.number().int().nullable(),
    tax_rate_bp: z.number().int().nullable(), // GST as basis points (1800 = 18%)
    amount_paise: z.number().int().nullable(),
    confidence_band: documentConfidenceBand,
  })),
});
export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
