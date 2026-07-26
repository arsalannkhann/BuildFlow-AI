import { describe, expect, test } from "vitest";
import { resolveAlias } from "@buildflow/domain/resolve";
import { containsTerm, findEntry } from "@buildflow/domain/resolve/terms";
import { EQUIPMENT, MATERIALS, TRADES } from "./lexicon";

/**
 * The lexicon is the DPR report-label projection; `@buildflow/domain/resolve/vocabulary` is
 * the resolution alias dictionary. They are allowed to have different SHAPES — the report
 * writes one coarse activity per row while resolution splits them for BOQ matching — but they
 * must not disagree about which spoken WORDS the product understands.
 *
 * This is the drift guard the lexicon comment promises: a spoken form the report layer reads
 * but the resolution layer has never heard of is a silent split-brain, where the same
 * transcript resolves on one path and falls through on the other. If this test fails, the fix
 * is to add the missing alias to the domain dictionary (the source of truth), not to delete it
 * here.
 */

// Both layers claim to use ONE whole-word matcher. If they ever diverged, "no" would fire
// inside "north" on one path and not the other; this pins the shared primitive.
test("word-boundary matching is script-aware and shared", () => {
  expect(containsTerm("north wall", "no")).toBe(false);
  expect(containsTerm("abandoned pour", "band")).toBe(false);
  expect(containsTerm("chhat ki dhalai", "dhalai")).toBe(true);
  // A Devanagari matra must not be treated as a word boundary that shreds the term.
  expect(containsTerm("सरिया आया", "सरिया")).toBe(true);
});

describe("every spoken form the report layer knows is in the domain dictionary", () => {
  const cases: [string, typeof TRADES, "trade" | "material" | "equipment"][] = [
    ["trade", TRADES, "trade"],
    ["material", MATERIALS, "material"],
    ["equipment", EQUIPMENT, "equipment"],
  ];

  for (const [label, entries, kind] of cases) {
    test(`${label} terms all resolve`, () => {
      const orphans: string[] = [];
      for (const entry of entries) {
        for (const term of entry.terms) {
          if (!resolveAlias(term, kind)) orphans.push(`${entry.canonical}: "${term}"`);
        }
      }
      // A precise failure message: which words the report reads that resolution cannot.
      expect(orphans, `spoken forms missing from the ${kind} dictionary:\n${orphans.join("\n")}`)
        .toEqual([]);
    });
  }
});

test("the lexicon still answers what activity a clause is about", () => {
  // A smoke check that delegating to the shared matcher did not change extraction behaviour:
  // longest-match-first still holds, so "ready-mix" beats bare "concrete".
  expect(findEntry("rmc truck aaya", MATERIALS)?.canonical).toBe("ready-mix concrete");
  expect(findEntry("jcb se khudai", EQUIPMENT)?.canonical).toBe("excavator");
});
