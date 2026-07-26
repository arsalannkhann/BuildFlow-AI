import { expect, test } from "vitest";
import { DPR_SCHEMA_VERSION, type DprStructuredData } from "@buildflow/domain/dpr/schema";
import {
  applyAudioQualitySignals, assessAudioQuality, runDeterministicValidations,
} from "@buildflow/domain/dpr/validate";

/**
 * The audio-quality check lives in `@buildflow/domain` but is exercised from the pipeline,
 * which is the only consumer and the package this change owns.
 */

function draft(): DprStructuredData {
  return {
    schema_version: DPR_SCHEMA_VERSION,
    work_items: [{
      description: "Slab work going on", location: null, activity: "Slab",
      quantity: { value: "12", unit: "cum" },
      source_refs: [{ quote: "Slab work going on" }], confidence_band: "Supported",
    }],
    labour: [{ trade: "mason", count: 4, source_refs: [], confidence_band: "Supported" }],
    materials: [], equipment: [], safety_quality: [], blockers: [],
    weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
    tomorrow_plan: [],
  };
}

test("a six-second recording warns the reviewer and rejects nothing", () => {
  const issues = assessAudioQuality({ durationMs: 6_000, transcriptText: "Slab work going on." });
  const short = issues.find((issue) => issue.code === "audio_too_short");
  expect(short).toBeDefined();
  expect(short!.message).toContain("6-second recording");
  expect(short!.message.toLowerCase()).toContain("nothing was rejected");

  const { data } = applyAudioQualitySignals(draft(), { durationMs: 6_000, transcriptText: "Slab." });
  // The engineer's work survives intact — every value is preserved, only the band moves.
  expect(data.work_items).toHaveLength(1);
  expect(data.work_items[0].quantity).toEqual({ value: "12", unit: "cum" });
  expect(data.work_items[0].confidence_band).toBe("Check");
  expect(data.labour[0].count).toBe(4);
  expect(data.labour[0].confidence_band).toBe("Check");
});

test("a normal recording produces no warning and no downgrade", () => {
  const transcriptText = new Array(200).fill("cement slab work done today").join(" ");
  expect(assessAudioQuality({ durationMs: 180_000, transcriptText })).toEqual([]);
  const { data } = applyAudioQualitySignals(draft(), { durationMs: 180_000, transcriptText });
  expect(data.work_items[0].confidence_band).toBe("Supported");
});

test("a long recording with almost no words is flagged as sparse", () => {
  const issues = assessAudioQuality({ durationMs: 240_000, transcriptText: "haan theek hai" });
  expect(issues.map((issue) => issue.code)).toContain("transcript_sparse_for_duration");
  expect(issues.find((i) => i.code === "transcript_sparse_for_duration")!.message)
    .toContain("3 words");
});

test("an unknown duration produces no signal rather than a guessed one", () => {
  expect(assessAudioQuality({ durationMs: null, transcriptText: "short" })).toEqual([]);
  expect(assessAudioQuality({ durationMs: undefined, transcriptText: "short" })).toEqual([]);
  expect(assessAudioQuality(null)).toEqual([]);
  expect(assessAudioQuality({ durationMs: Number.NaN, transcriptText: "short" })).toEqual([]);
});

test("existing callers of runDeterministicValidations are unaffected", () => {
  // Two-argument callers must behave exactly as before: no quality issues, no downgrades.
  const before = runDeterministicValidations(draft(), "Slab work going on");
  expect(before.issues).toEqual([]);
  expect(before.data.work_items[0].confidence_band).toBe("Supported");

  const withAudio = runDeterministicValidations(draft(), "Slab work going on", {
    durationMs: 4_000, transcriptText: "Slab work going on",
  });
  expect(withAudio.issues.map((issue) => issue.code)).toContain("audio_too_short");
  expect(withAudio.data.work_items[0].confidence_band).toBe("Check");
});
