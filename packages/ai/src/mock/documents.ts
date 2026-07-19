import type { DocumentExtractionPort } from "../ports";
import {
  CHALLAN_SCHEMA_VERSION, INVOICE_SCHEMA_VERSION,
  challanSchema, invoiceExtractionSchema,
  type ChallanExtraction, type InvoiceExtraction,
} from "../documents/schema";

// Deterministic fixture-driven extraction: always available, no network, same output for
// the same input kind. Non-image inputs return null (unsupported) exactly like a real
// provider would, so the "human enters lines manually" path stays exercised in dev.

const challanFixture: ChallanExtraction = {
  schema_version: CHALLAN_SCHEMA_VERSION,
  supplier_name: { value: "Shri Balaji Building Materials", confidence_band: "Supported" },
  challan_number: { value: "CH-2041", confidence_band: "Supported" },
  receipt_date: { value: null, confidence_band: "Missing" },
  lines: [
    {
      description_raw: "OPC 43 Grade Cement 50kg bags",
      quantity: "50", unit: "bag", rate_paise: 38500, amount_paise: 1925000,
      confidence_band: "Supported",
    },
    {
      description_raw: "Coarse sand (badarpur)",
      quantity: "3.5", unit: "cum", rate_paise: null, amount_paise: null,
      confidence_band: "Check",
    },
  ],
};

const invoiceFixture: InvoiceExtraction = {
  schema_version: INVOICE_SCHEMA_VERSION,
  supplier_name: { value: "Shri Balaji Building Materials", confidence_band: "Supported" },
  supplier_gstin: { value: "07AABCS1234E1Z5", confidence_band: "Check" },
  invoice_number: { value: "INV-7781", confidence_band: "Supported" },
  invoice_date: { value: "2026-07-15", confidence_band: "Supported" },
  subtotal_paise: { value: 1925000, confidence_band: "Supported" },
  tax_paise: { value: 539000, confidence_band: "Check" },
  total_paise: { value: 2464000, confidence_band: "Supported" },
  lines: [
    {
      description: "OPC 43 Grade Cement 50kg bags", hsn: "2523",
      quantity: "50", unit: "bag", rate_paise: 38500, tax_rate_bp: 2800, amount_paise: 1925000,
      confidence_band: "Supported",
    },
  ],
};

export class MockDocumentExtraction implements DocumentExtractionPort {
  readonly meta = { provider: "mock", model: "mock-document-1", promptVersion: "document-extraction.v1" };

  async extractChallan({ contentType }: { imageBytes: Uint8Array; contentType: string }): Promise<ChallanExtraction | null> {
    if (!contentType.startsWith("image/")) return null;
    return challanSchema.parse(challanFixture); // the mock honors the same contract gate
  }

  async extractInvoice({ contentType }: { imageBytes: Uint8Array; contentType: string }): Promise<InvoiceExtraction | null> {
    if (!contentType.startsWith("image/")) return null;
    return invoiceExtractionSchema.parse(invoiceFixture);
  }
}
