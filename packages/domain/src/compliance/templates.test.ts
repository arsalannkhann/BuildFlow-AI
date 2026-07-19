import { expect, test } from "vitest";
import {
  COMPLIANCE_LEGAL_CAUTION, complianceTemplate, isCompliancePackKind,
} from "./templates";

test("templates are useful, copied, and retain the legal caution", () => {
  const first = complianceTemplate("dpcc_dust");
  expect(first.length).toBeGreaterThanOrEqual(4);
  first[0].text = "changed";
  expect(complianceTemplate("dpcc_dust")[0].text).not.toBe("changed");
  expect(COMPLIANCE_LEGAL_CAUTION).toMatch(/not legal advice/i);
  expect(COMPLIANCE_LEGAL_CAUTION).toMatch(/not.*submission/i);
});

test("custom packs start empty and kinds are validated", () => {
  expect(complianceTemplate("custom")).toEqual([]);
  expect(isCompliancePackKind("grap")).toBe(true);
  expect(isCompliancePackKind("certificate_of_compliance")).toBe(false);
});
