import { expect, test } from "vitest";
import { MOCK_NORMALIZED_MARKER, MockTranscriptNormalization } from "./normalize";
import { MockTranscription } from "./transcription";
import { detectNormalizationNeed } from "../site/language";
import type { TranscriptResult } from "../ports";

const transcript = (text: string, language: string): TranscriptResult => ({
  text, language, segments: [{ text, startMs: 0, endMs: 1000 }],
});

test("plain English needs no rendering, so none is produced", async () => {
  const port = new MockTranscriptNormalization();
  const english = await new MockTranscription().transcribe({ audioBytes: new Uint8Array() });
  expect(await port.normalize({ transcript: english })).toBeNull();
  expect(await port.normalize({
    transcript: transcript("Plaster work at level four was completed today.", "en-IN"),
  })).toBeNull();
});

test("Devanagari and Hinglish both produce a rendering that preserves the original text", async () => {
  const port = new MockTranscriptNormalization();
  const devanagari = await port.normalize({
    transcript: transcript("आज छत की ढलाई हुई।", "hi-IN"),
  });
  expect(devanagari?.text).toContain("आज छत की ढलाई हुई।");
  expect(devanagari?.text.startsWith(MOCK_NORMALIZED_MARKER)).toBe(true);
  expect(devanagari?.target_language).toBe("en");

  // Providers routinely label a code-mixed update "en"; the script and marker checks decide.
  const hinglish = await port.normalize({
    transcript: transcript("Cement NAHI aaya, isliye dhalai nahi hui.", "en-IN"),
  });
  expect(hinglish?.text).toContain("Cement NAHI aaya");
});

test("empty audio produces no rendering rather than an empty one", async () => {
  const port = new MockTranscriptNormalization();
  expect(await port.normalize({ transcript: transcript("   ", "hi-IN") })).toBeNull();
});

test("code-mixed detection needs two independent markers, not one", () => {
  // One stray token must not label an English update as Hinglish and buy a translation.
  expect(detectNormalizationNeed({ language: "en-IN", text: "The kaam is done." }).needed).toBe(false);
  expect(detectNormalizationNeed({ language: "en-IN", text: "Aaj kaam nahi hua" }).reason).toBe("code_mixed");
  expect(detectNormalizationNeed({ language: "hi-IN", text: "work done" }).reason).toBe("non_english_language");
  expect(detectNormalizationNeed({ language: "en", text: "छत की ढलाई" }).reason).toBe("devanagari_script");
});
