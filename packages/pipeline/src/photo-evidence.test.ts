import { expect, test } from "vitest";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@buildflow/domain/dpr/schema";
import { getAiRegistry } from "@buildflow/ai/registry";
import type { StoragePort } from "@buildflow/storage/port";
import { attachPhotoEvidence, type TaggablePhoto } from "./photo-evidence";

/** In-memory storage: photo bytes only, no filesystem, no network. */
function fakeStorage(objects: Record<string, string>): StoragePort {
  return {
    async get(key) {
      const value = objects[key];
      if (value === undefined) throw new Error(`missing object ${key}`);
      return new TextEncoder().encode(value);
    },
    async put() { throw new Error("not used"); },
    async exists() { return true; },
    async delete() {},
    async list() { return Object.keys(objects); },
  };
}

function draft(description: string): DprStructuredData {
  return {
    schema_version: DPR_SCHEMA_VERSION,
    work_items: [{
      description, location: "level 3", activity: "RCC",
      quantity: { value: "2.5", unit: "cum" },
      source_refs: [{ quote: description }], confidence_band: "Supported",
    }],
    labour: [{ trade: "mason", count: 6, source_refs: [], confidence_band: "Supported" }],
    materials: [], equipment: [], safety_quality: [], blockers: [],
    weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
    tomorrow_plan: [],
  };
}

const photo = (id: string): TaggablePhoto => ({
  id, objectKey: `photos/${id}.jpg`, contentType: "image/jpeg",
});

test("a photo that matches a work item lands in that item's source_refs", async () => {
  const data = draft("Column reinforcement tied at level three before shuttering");
  const photos = ["p1", "p2", "p3", "p4", "p5", "p6"].map(photo);
  const objects = Object.fromEntries(photos.map((p) => [p.objectKey, p.id]));

  const result = await attachPhotoEvidence({
    ai: getAiRegistry(), storage: fakeStorage(objects), data, photos,
  });

  expect(result.tagged).toBeGreaterThan(0);
  expect(result.linked).toBeGreaterThan(0);
  const attached = result.data.work_items[0].source_refs
    .filter((ref) => ref.attachment_id !== undefined)
    .map((ref) => ref.attachment_id);
  expect(attached.length).toBe(result.linked);
  expect(result.evidence.every((item) => item.caption.length > 0)).toBe(true);
});

test("an unmatchable photo yields no match and mutates no quantity", async () => {
  // The work item shares no vocabulary with any photo the provider can describe.
  const data = draft("Air conditioning duct insulation in the server room");
  const before = structuredClone(data);
  const photos = ["p1", "p2", "p3", "p4", "p5", "p6"].map(photo);

  const result = await attachPhotoEvidence({
    ai: getAiRegistry(),
    storage: fakeStorage(Object.fromEntries(photos.map((p) => [p.objectKey, p.id]))),
    data, photos,
  });

  expect(result.linked).toBe(0);
  expect(result.evidence.every((item) => item.workItemIndex === null)).toBe(true);
  // Nothing about the claim may move: quantity, band, description, labour count.
  expect(result.data.work_items[0].quantity).toEqual(before.work_items[0].quantity);
  expect(result.data.work_items[0].confidence_band).toBe(before.work_items[0].confidence_band);
  expect(result.data.work_items[0].description).toBe(before.work_items[0].description);
  expect(result.data.labour).toEqual(before.labour);
  expect(result.data.work_items[0].source_refs).toEqual(before.work_items[0].source_refs);
  // The caller's object is never mutated in place either.
  expect(data).toEqual(before);
});

test("only up to the cap is processed, in a stable order", async () => {
  const data = draft("Column reinforcement tied at level three before shuttering");
  const photos = ["p9", "p1", "p5", "p3", "p7"].map(photo);
  const storage = fakeStorage(Object.fromEntries(photos.map((p) => [p.objectKey, p.id])));

  const result = await attachPhotoEvidence({
    ai: getAiRegistry(), storage, data, photos, limit: 2,
  });
  expect(result.considered).toBe(2);
  const again = await attachPhotoEvidence({
    ai: getAiRegistry(), storage, data, photos: [...photos].reverse(), limit: 2,
  });
  expect(again.evidence.map((e) => e.attachmentId)).toEqual(result.evidence.map((e) => e.attachmentId));
});

test("a photo whose bytes are missing is skipped, not fatal", async () => {
  const data = draft("Column reinforcement tied at level three before shuttering");
  const photos = [photo("p1"), photo("p2")];
  const result = await attachPhotoEvidence({
    ai: getAiRegistry(),
    storage: fakeStorage({ [photos[0].objectKey]: "p1" }), // p2 is absent
    data, photos,
  });
  expect(result.failed).toBe(1);
  expect(result.considered).toBe(2);
});

test("with no work items there is nothing to evidence and no model call is made", async () => {
  const empty = draft("x");
  empty.work_items = [];
  let reads = 0;
  const storage: StoragePort = {
    ...fakeStorage({}),
    async get() { reads += 1; return new Uint8Array(); },
  };
  const result = await attachPhotoEvidence({
    ai: getAiRegistry(), storage, data: empty, photos: [photo("p1")],
  });
  expect(reads).toBe(0);
  expect(result.considered).toBe(0);
});
