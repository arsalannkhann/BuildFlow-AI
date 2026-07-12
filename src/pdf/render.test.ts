import { expect, test } from "vitest";
import { renderDprPdf } from "./render";
import { MockExtraction } from "@/ai/mock/extraction";

test("renderDprPdf returns a non-trivial PDF byte stream from approved data", async () => {
  const data = await new MockExtraction().extract({ transcript: null });
  const bytes = await renderDprPdf({ documentId: "doc-1", version: 1, reportDate: "2026-07-13",
    data, summaryClientSafe: "Column C4 cast.", issuedBy: "seed-manager" });
  expect(bytes.byteLength).toBeGreaterThan(1000);
  // PDF magic header %PDF
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
}, 60_000);
