import { expect, test } from "vitest";
import type { AiRegistry } from "@buildflow/ai/registry";
import type { EntityChoice, ResolutionQuestion } from "@buildflow/ai/resolve/schema";
import {
  LLM_MAX_QUESTIONS, SEMANTIC_MARGIN, SEMANTIC_THRESHOLD, cosine, refineResolutions,
  type FieldResolution, type ProjectVocabulary,
} from "./entity-resolution";

/**
 * These tests are about ONE property: an unclear mapping must reach the reviewer, never the
 * record. Every tier below is allowed to decline; none is allowed to guess.
 */

const emptyVocab = (): ProjectVocabulary => ({
  locations: [], activities: [], materials: [], scheduleItems: [], aliases: [],
});

/** An open finding: the deterministic tiers gave up on it. */
const open = (rawText: string, entityKind: FieldResolution["entityKind"]): FieldResolution => ({
  fieldPath: `work_items[0].${entityKind}`,
  entityKind,
  resolution: {
    rawText, method: "unresolved", canonicalValue: null, entityId: null,
    score: null, candidates: [], confident: false,
  },
});

/**
 * Embeddings we control: each text is placed by hand on a unit circle, so "similar" and
 * "ambiguous" are exact, reproducible facts about the test rather than properties of a
 * provider that could drift.
 */
function fakeEmbeddings(angles: Record<string, number>): AiRegistry["embeddings"] {
  return {
    meta: { provider: "test", model: "unit-circle" },
    async embed({ texts }) {
      return texts.map((text) => {
        const angle = angles[text];
        if (angle === undefined) throw new Error(`test fixture has no angle for "${text}"`);
        return [Math.cos(angle), Math.sin(angle)];
      });
    },
  };
}

const noEmbeddings: AiRegistry["embeddings"] = {
  meta: { provider: "test", model: "unavailable" },
  async embed() { throw new Error("embedding backend down"); },
};

function fakeResolution(
  answer: (question: ResolutionQuestion, index: number) => EntityChoice | null,
): AiRegistry["resolution"] & { asked: ResolutionQuestion[][] } {
  const asked: ResolutionQuestion[][] = [];
  return {
    asked,
    meta: { provider: "test", model: "scripted", promptVersion: "test.v1" },
    async choose({ questions }) {
      asked.push(questions);
      return questions.map(answer);
    },
  };
}

const neverAsked: AiRegistry["resolution"] = {
  meta: { provider: "test", model: "must-not-run", promptVersion: "test.v1" },
  async choose() { throw new Error("the LLM tier must not be reached in this case"); },
};

test("a phrase with a clear embedding neighbour is linked by the semantic tier", async () => {
  const vocab = { ...emptyVocab(), activities: [
    { id: "act-slab", name: "Slab work" },
    { id: "act-paint", name: "Painting" },
  ] };
  // "chhat" sits right next to the slab record and far from painting: no trigram in common,
  // which is exactly the case the deterministic tiers cannot settle.
  const ai = {
    embeddings: fakeEmbeddings({ chhat: 0, "Slab work": 0.05, Painting: 1.5 }),
    resolution: neverAsked,
  };

  const { findings, stats } = await refineResolutions({
    ai, transcript: "chhat ki dhalai hui", findings: [open("chhat", "activity")], vocab,
  });

  expect(findings[0].resolution.method).toBe("semantic");
  expect(findings[0].resolution.entityId).toBe("act-slab");
  expect(findings[0].resolution.confident).toBe(true);
  expect(stats.semantic).toBe(1);
  expect(stats.llmAsked).toBe(0);
});

test("two near-identical records are handed to the LLM instead of being guessed at", async () => {
  const vocab = { ...emptyVocab(), locations: [
    { id: "loc-a", name: "Block A" },
    { id: "loc-a-base", name: "Block A basement" },
  ] };
  // Both records sit within the margin of the phrase. A bare top-1 would link one of them;
  // requiring daylight between first and second place turns it into a question.
  const ai = {
    embeddings: fakeEmbeddings({ "block a wala": 0, "Block A": 0.05, "Block A basement": 0.06 }),
    resolution: fakeResolution(() => ({
      choice_index: 1, confidence: "high", reason: "the engineer said basement earlier",
    })),
  };

  const { findings, stats } = await refineResolutions({
    ai, transcript: "block a wala basement mein kaam", findings: [open("block a wala", "location")], vocab,
  });

  expect(stats.semantic).toBe(0);
  expect(stats.llmAsked).toBe(1);
  expect(findings[0].resolution.method).toBe("llm");
  expect(findings[0].resolution.entityId).toBe("loc-a-base");
  // A model choice carries no meaningful number; reporting one would invent precision.
  expect(findings[0].resolution.score).toBeNull();
});

test("the LLM only ever sees a shortlist, and only names from it", async () => {
  const vocab = { ...emptyVocab(), materials: Array.from({ length: 9 }, (_, i) => ({
    id: `mat-${i}`, name: `Material ${i}`,
  })) };
  const angles: Record<string, number> = { "kuch aur": 0 };
  vocab.materials.forEach((material, i) => { angles[material.name] = 0.4 + i * 0.01; });
  const resolution = fakeResolution(() => null);

  await refineResolutions({
    ai: { embeddings: fakeEmbeddings(angles), resolution },
    transcript: "kuch aur bhi aaya", findings: [open("kuch aur", "material")], vocab,
  });

  const [questions] = resolution.asked;
  expect(questions).toHaveLength(1);
  expect(questions[0].candidates).toHaveLength(5);
  // Every option offered is a real project record — the model has no field for anything else.
  const names = new Set(vocab.materials.map((material) => material.name));
  for (const candidate of questions[0].candidates) expect(names.has(candidate)).toBe(true);
});

test("a fabricated candidate index is refused rather than linked", async () => {
  const vocab = { ...emptyVocab(), locations: [{ id: "loc-1", name: "Tower B" }] };
  const ai = {
    embeddings: fakeEmbeddings({ "kahin aur": 0, "Tower B": 1.2 }),
    // Index 7 does not exist in a one-candidate shortlist: a pointer to nothing.
    resolution: fakeResolution(() => ({ choice_index: 7, confidence: "high", reason: "" })),
  };

  const { findings, stats } = await refineResolutions({
    ai, transcript: "kahin aur", findings: [open("kahin aur", "location")], vocab,
  });

  expect(findings[0].resolution.method).toBe("unresolved");
  expect(findings[0].resolution.entityId).toBeNull();
  expect(stats.llmAbstained).toBe(1);
  expect(stats.llm).toBe(0);
});

test("a low-confidence pick stays an open question with its shortlist intact", async () => {
  const vocab = { ...emptyVocab(), activities: [
    { id: "act-1", name: "Plaster" }, { id: "act-2", name: "Putty" },
  ] };
  const ai = {
    embeddings: fakeEmbeddings({ safedi: 0, Plaster: 0.5, Putty: 0.52 }),
    resolution: fakeResolution(() => ({ choice_index: 0, confidence: "low", reason: "unsure" })),
  };

  const { findings } = await refineResolutions({
    ai, transcript: "safedi ka kaam", findings: [open("safedi", "activity")], vocab,
  });

  expect(findings[0].resolution.entityId).toBeNull();
  expect(findings[0].resolution.confident).toBe(false);
  // The reviewer still gets the ranked options, so the dropdown is never empty.
  expect(findings[0].resolution.candidates.map((c) => c.name)).toEqual(["Plaster", "Putty"]);
});

test("a medium-confidence pick is recorded but still needs confirmation", async () => {
  const vocab = { ...emptyVocab(), activities: [
    { id: "act-1", name: "Curing" }, { id: "act-2", name: "Shuttering" },
  ] };
  const ai = {
    embeddings: fakeEmbeddings({ tarai: 0, Curing: 0.5, Shuttering: 0.52 }),
    resolution: fakeResolution(() => ({ choice_index: 0, confidence: "medium", reason: "likely" })),
  };

  const { findings } = await refineResolutions({
    ai, transcript: "tarai chal rahi hai", findings: [open("tarai", "activity")], vocab,
  });

  expect(findings[0].resolution.method).toBe("llm");
  expect(findings[0].resolution.entityId).toBe("act-1");
  expect(findings[0].resolution.confident).toBe(false);
});

test("an unavailable embedding backend degrades to a lexical shortlist, it does not fail", async () => {
  const vocab = { ...emptyVocab(), materials: [
    { id: "mat-1", name: "TMT steel" }, { id: "mat-2", name: "Cement OPC 53" },
  ] };
  const resolution = fakeResolution(() => null);

  const { findings, stats } = await refineResolutions({
    ai: { embeddings: noEmbeddings, resolution },
    transcript: "tmt steal khatam", findings: [open("tmt steal", "material")], vocab,
  });

  expect(stats.embeddingFailed).toBe(true);
  expect(stats.llmAsked).toBe(1);
  // Lexical ranking still puts the near-miss spelling first.
  expect(resolution.asked[0][0].candidates[0]).toBe("TMT steel");
  expect(findings[0].resolution.method).toBe("unresolved");
});

test("an unavailable model leaves the questions open rather than failing the report", async () => {
  const vocab = { ...emptyVocab(), locations: [{ id: "loc-1", name: "Tower B" }] };
  const ai = {
    embeddings: fakeEmbeddings({ "tower bee": 0, "Tower B": 0.9 }),
    resolution: {
      meta: { provider: "test", model: "down", promptVersion: "test.v1" },
      async choose(): Promise<(EntityChoice | null)[]> { throw new Error("503"); },
    },
  };

  const { findings, stats } = await refineResolutions({
    ai, transcript: "tower bee mein kaam", findings: [open("tower bee", "location")], vocab,
  });

  expect(findings[0].resolution.method).toBe("unresolved");
  expect(stats.llm).toBe(0);
});

test("phrases with nothing to resolve to cost no provider calls", async () => {
  // A project with no locations recorded: no model can turn "tower b" into a record that
  // does not exist, so neither tier should run.
  const { stats } = await refineResolutions({
    ai: { embeddings: noEmbeddings, resolution: neverAsked },
    transcript: "tower b", findings: [open("tower b", "location")], vocab: emptyVocab(),
  });

  expect(stats.open).toBe(0);
  expect(stats.embeddingFailed).toBe(false);
  expect(stats.llmAsked).toBe(0);
});

test("a pathological report is capped, and reports what it dropped", async () => {
  const vocab = { ...emptyVocab(), locations: [
    { id: "loc-1", name: "Tower B" }, { id: "loc-2", name: "Tower C" },
  ] };
  const angles: Record<string, number> = { "Tower B": 0.5, "Tower C": 0.52 };
  const findings = Array.from({ length: LLM_MAX_QUESTIONS + 4 }, (_, i) => {
    angles[`site ${i}`] = 0;
    return open(`site ${i}`, "location");
  });
  const resolution = fakeResolution(() => null);

  const { stats } = await refineResolutions({
    ai: { embeddings: fakeEmbeddings(angles), resolution },
    transcript: "long update", findings, vocab,
  });

  expect(stats.llmAsked).toBe(LLM_MAX_QUESTIONS);
  // Silent truncation would read as "everything was considered". It must be visible.
  expect(stats.llmSkipped).toBe(4);
});

test("the semantic thresholds are the ones the tier claims to enforce", () => {
  // A guard on the constants themselves: loosening them silently is how a near-tie starts
  // getting linked without anyone noticing.
  expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
  expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  expect(SEMANTIC_THRESHOLD).toBeGreaterThanOrEqual(0.7);
  expect(SEMANTIC_MARGIN).toBeGreaterThan(0);
});

test("equipment is never offered an activity record as a candidate", async () => {
  // "JCB" and "Excavation" are related in meaning and completely different as records. No
  // project table holds plant yet, so the honest outcome is a normalised name and no link.
  const vocab = { ...emptyVocab(), activities: [{ id: "act-dig", name: "Excavation" }] };
  const { findings, stats } = await refineResolutions({
    ai: { embeddings: noEmbeddings, resolution: neverAsked },
    transcript: "JCB chal rahi thi", findings: [open("JCB", "equipment")], vocab,
  });

  expect(stats.open).toBe(0);
  expect(findings[0].resolution.entityId).toBeNull();
});
