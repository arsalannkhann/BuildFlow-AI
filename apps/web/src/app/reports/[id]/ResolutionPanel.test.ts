import { expect, test } from "vitest";
import { needsAttention, type ResolutionRow } from "./ResolutionPanel";

/**
 * `needsAttention` decides which mappings the reviewer is asked to settle. The subtle case it
 * has to get right: a dictionary "alias" match that normalised the words but linked to NO
 * project record is NOT settled — nothing was actually linked — yet only when there is a
 * record the reviewer could pick. An empty dropdown is not a decision.
 */

const row = (over: Partial<ResolutionRow>): ResolutionRow => ({
  id: "r", fieldPath: "materials[0].name", entityKind: "material", rawText: "chadar",
  canonicalValue: null, entityId: null, method: "unresolved", score: null, confirmedAt: null,
  ...over,
});

const withMaterials = { material: [{ id: "m1", name: "Cement OPC 53" }] };

test("an unmatched phrase always needs a decision", () => {
  expect(needsAttention(row({ method: "unresolved" }), withMaterials)).toBe(true);
});

test("model and meaning matches are always surfaced for a human nod", () => {
  expect(needsAttention(row({ method: "llm", entityId: "m1" }), withMaterials)).toBe(true);
  expect(needsAttention(row({ method: "semantic", entityId: "m1" }), withMaterials)).toBe(true);
});

test("an alias normalised to a canonical term but linked to nothing still needs review", () => {
  // The regression this guards: "read as Cement" shown as settled while entityId is null.
  expect(needsAttention(row({ method: "alias", entityId: null }), withMaterials)).toBe(true);
});

test("an unlinked alias for a kind with no records to pick from stays settled", () => {
  // A trade has no project table; the normalisation is genuinely all there is, and an empty
  // dropdown would be a non-decision.
  expect(needsAttention(row({ entityKind: "trade", method: "alias", entityId: null }), {})).toBe(false);
});

test("a linked alias and a confirmed row are settled", () => {
  expect(needsAttention(row({ method: "alias", entityId: "m1" }), withMaterials)).toBe(false);
  expect(needsAttention(row({ method: "unresolved", confirmedAt: new Date() }), withMaterials)).toBe(false);
});
