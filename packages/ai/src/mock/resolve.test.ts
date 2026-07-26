import { expect, test } from "vitest";
import { MockEntityResolution } from "./resolve";
import {
  ENTITY_RESOLUTION_SCHEMA_VERSION, alignDecisions, clampChoice, entityResolutionSchema,
  type ResolutionQuestion,
} from "../resolve/schema";
import { ENTITY_RESOLUTION_SYSTEM_PROMPT, entityResolutionUserPrompt } from "../resolve/prompt";

const question = (
  phrase: string, candidates: string[], kind = "location",
): ResolutionQuestion => ({ phrase, kind, candidates });

test("the model can only answer with an index into the list it was given", () => {
  // The safety property is structural, not a prompt promise: there is no field in which a
  // record name, id, quantity or status could be returned.
  const parsed = entityResolutionSchema.parse({
    schema_version: ENTITY_RESOLUTION_SCHEMA_VERSION,
    decisions: [{
      question_index: 0, choice_index: 0, confidence: "high", reason: "ok",
      // A model that tries to name its own record finds the key stripped.
      canonical_name: "Steel I invented", quantity: "5 cum", entity_id: "mat-9",
    }],
  });
  expect(Object.keys(parsed.decisions[0]).sort())
    .toEqual(["choice_index", "confidence", "question_index", "reason"]);
});

test("an out-of-range index becomes an abstention, not a wrong link", () => {
  expect(clampChoice({ choice_index: 3, confidence: "high", reason: "" }, 2).choice_index).toBeNull();
  expect(clampChoice({ choice_index: -1, confidence: "high", reason: "" }, 2).choice_index).toBeNull();
  expect(clampChoice({ choice_index: 1, confidence: "high", reason: "" }, 2).choice_index).toBe(1);
});

test("a low-confidence answer is treated as an abstention", () => {
  // A guess that arrives already labelled "decided" is worse than a visible gap, because
  // nobody re-reads a mapping that looks settled.
  expect(clampChoice({ choice_index: 0, confidence: "low", reason: "" }, 2).choice_index).toBeNull();
});

test("answers are aligned to questions, and a duplicate never overwrites the first", () => {
  const questions = [question("a", ["A1"]), question("b", ["B1"]), question("c", ["C1"])];
  const aligned = alignDecisions(entityResolutionSchema.parse({
    schema_version: ENTITY_RESOLUTION_SCHEMA_VERSION,
    decisions: [
      { question_index: 2, choice_index: 0, confidence: "high", reason: "" },
      { question_index: 2, choice_index: null, confidence: "high", reason: "changed my mind" },
      { question_index: 9, choice_index: 0, confidence: "high", reason: "no such question" },
    ],
  }), questions);

  expect(aligned[0]).toBeNull();
  expect(aligned[1]).toBeNull(); // unanswered stays unresolved -> the reviewer is asked
  expect(aligned[2]?.choice_index).toBe(0);
});

test("the mock picks on shared words and abstains on a tie", async () => {
  const port = new MockEntityResolution();
  const [match, tie, nothing] = await port.choose({
    transcript: "tower b slab work done",
    questions: [
      question("tower b slab", ["Tower B slab", "Tower C footing"]),
      question("slab", ["Slab work east", "Slab work west"]),
      question("kuch aur", ["Tower B slab", "Tower C footing"]),
    ],
  });

  expect(match?.choice_index).toBe(0);
  // Two candidates matching the phrase equally well is exactly what a human must settle.
  expect(tie?.choice_index).toBeNull();
  expect(nothing?.choice_index).toBeNull();
});

test("the prompt tells the model that a missing record is a valid answer", () => {
  // Regression guard on the instruction that actually prevents forced matches.
  expect(ENTITY_RESOLUTION_SYSTEM_PROMPT).toContain("the answer is null");
  expect(ENTITY_RESOLUTION_SYSTEM_PROMPT).toContain("untrusted data");
});

test("the user prompt numbers the candidates and caps the transcript", () => {
  const payload = JSON.parse(entityResolutionUserPrompt({
    transcript: "x".repeat(20_000),
    questions: [question("chhat", ["Slab work", "Painting"], "activity")],
  }));

  expect(payload.transcript.length).toBe(8_000);
  expect(payload.questions[0].candidates).toEqual([
    { index: 0, name: "Slab work" }, { index: 1, name: "Painting" },
  ]);
});
