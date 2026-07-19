import { expect, test } from "vitest";
import { renderComplianceCoverPdf } from "./compliance";

test("renders a non-trivial draft compliance cover PDF", async () => {
  const bytes = await renderComplianceCoverPdf({
    packId: "pack-1", title: "Dust controls <Q1>", projectName: "Tower A",
    kindLabel: "Dust-control evidence pack", periodStart: "2026-01-01", periodEnd: "2026-03-31",
    version: 1, exportedAt: "2026-07-19T10:00:00.000Z", status: "DRAFT",
    requirements: { total: 5, satisfied: 3, notApplicable: 1, pending: 1 },
    legalCaution: "Operational organizer only; not legal advice or a regulator submission.",
  });
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect(bytes.byteLength).toBeGreaterThan(2_000);
});
