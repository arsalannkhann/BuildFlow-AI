import { expect, test } from "vitest";
import { buildFieldRows } from "./view-model";
import { MockExtraction } from "@/ai/mock/extraction";

test("buildFieldRows flattens DPR into labelled rows with bands and spans", async () => {
  const data = await new MockExtraction().extract({ transcript: null });
  const rows = buildFieldRows(data);
  const work = rows.find((r) => r.path === "work_items[0].description");
  expect(work?.band).toBe("Supported");
  expect(rows.some((r) => r.band === "Missing")).toBe(true);
});
