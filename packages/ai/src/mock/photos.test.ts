import { expect, test } from "vitest";
import { MockPhotoTagging } from "./photos";
import { clampWorkItemMatch, photoTagSchema, PHOTO_TAG_SCHEMA_VERSION } from "../photos/schema";

const bytesFor = (seed: string) => new TextEncoder().encode(seed);

/** Fixture selection is seeded by the bytes, so this probes every caption in the set. */
async function tagWithDescriptions(descriptions: string[]) {
  const port = new MockPhotoTagging();
  const results = [];
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    results.push(await port.tagPhoto({
      imageBytes: bytesFor(seed), contentType: "image/jpeg", workItemDescriptions: descriptions,
    }));
  }
  return results;
}

test("photo tagging never invents a work-item match", async () => {
  // Nothing in these descriptions overlaps any photo fixture's vocabulary.
  const unmatchable = ["Air conditioning duct insulation in the server room"];
  for (const tag of await tagWithDescriptions(unmatchable)) {
    expect(tag).not.toBeNull();
    expect(tag!.matches_work_item_index).toBeNull();
  }
});

test("a matching description is linked, and only by index", async () => {
  const results = await tagWithDescriptions([
    "Air conditioning duct insulation in the server room",
    "Column reinforcement tied at level three before shuttering",
  ]);
  const matched = results.filter((tag) => tag!.matches_work_item_index !== null);
  expect(matched.length).toBeGreaterThan(0);
  for (const tag of matched) expect(tag!.matches_work_item_index).toBe(1);
});

test("unsupported mime types return null instead of a guess", async () => {
  const port = new MockPhotoTagging();
  for (const contentType of ["application/pdf", "video/mp4", "text/plain", "image/heic"]) {
    expect(await port.tagPhoto({
      imageBytes: bytesFor("x"), contentType, workItemDescriptions: ["Casting of column C4"],
    })).toBeNull();
  }
});

test("the same photo always produces the same caption", async () => {
  const port = new MockPhotoTagging();
  const input = {
    imageBytes: bytesFor("stable"), contentType: "image/png",
    workItemDescriptions: ["Casting of column C4"],
  };
  expect(await port.tagPhoto(input)).toEqual(await port.tagPhoto(input));
});

test("an out-of-range match index from any provider degrades to no match", () => {
  const tag = photoTagSchema.parse({
    schema_version: PHOTO_TAG_SCHEMA_VERSION,
    caption: "Slab pour underway", tags: ["slab"], matches_work_item_index: 7,
  });
  expect(clampWorkItemMatch(tag, 2).matches_work_item_index).toBeNull();
  expect(clampWorkItemMatch(tag, 8).matches_work_item_index).toBe(7);
});

test("no photo output can carry a quantity or progress field", () => {
  // Structural guarantee: the schema strips anything beyond caption/tags/match.
  const parsed = photoTagSchema.parse({
    schema_version: PHOTO_TAG_SCHEMA_VERSION,
    caption: "Slab pour underway", tags: ["slab"], matches_work_item_index: null,
    quantity: "12 cum", progress_percent: 60,
  });
  expect(parsed).not.toHaveProperty("quantity");
  expect(parsed).not.toHaveProperty("progress_percent");
});
