import { expect, test } from "vitest";
import { renderDprPdf, TEMPLATE_VERSION } from "./render";
import { MockExtraction } from "@buildflow/ai/mock/extraction";

test("renderDprPdf returns a non-trivial PDF byte stream from approved data", async () => {
  const data = await new MockExtraction().extract({ transcript: null });
  const bytes = await renderDprPdf({ documentId: "doc-1", version: 1, reportDate: "2026-07-13",
    data, summaryClientSafe: "Column C4 cast.", issuedBy: "seed-manager" });
  expect(bytes.byteLength).toBeGreaterThan(1000);
  // PDF magic header %PDF
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
}, 60_000);

test("the internal variant renders from the same input and is the current template", async () => {
  const data = await new MockExtraction().extract({ transcript: null });
  const bytes = await renderDprPdf({
    documentId: "doc-1", version: 1, reportDate: "2026-07-13", data,
    summaryClientSafe: "Column C4 cast.", summaryInternal: "Rain delay under-reported.",
    issuedBy: "seed-manager", variant: "internal",
  });
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  expect(bytes.byteLength).toBeGreaterThan(1000);
  // Bumped with the Tier-2 sections; historical documents keep their stored version.
  expect(TEMPLATE_VERSION).toBe("dpr-pdf.v4");
}, 60_000);
