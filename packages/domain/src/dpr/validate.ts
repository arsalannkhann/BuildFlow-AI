import type { DprStructuredData } from "./schema";

export type ValidationIssue = { code: string; path: string; message: string };

export function runDeterministicValidations(input: DprStructuredData): {
  data: DprStructuredData; issues: ValidationIssue[];
} {
  const data = structuredClone(input);
  const issues: ValidationIssue[] = [];

  data.work_items.forEach((w, i) => {
    if (w.quantity.value !== null && w.quantity.unit === null) {
      issues.push({ code: "quantity_missing_unit", path: `work_items[${i}]`,
        message: "Quantity has a value but no unit." });
      if (w.confidence_band === "Supported") w.confidence_band = "Check";
    }
  });

  return { data, issues };
}
