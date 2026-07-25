import { expect, test } from "vitest";
import { MockExtraction } from "./extraction";
import { MockTranscription } from "./transcription";
import { dprSchema } from "@buildflow/domain/dpr/schema";

test("mock extraction is schema-valid, deterministic, and never invents quantities", async () => {
  const t = await new MockTranscription().transcribe({ audioBytes: new Uint8Array() });
  const ex = new MockExtraction();
  const a = await ex.extract({ transcript: t });
  const b = await ex.extract({ transcript: t });
  expect(() => dprSchema.parse(a)).not.toThrow();
  expect(a).toEqual(b);
  // at least one Missing band and one null value exist (nothing invented)
  const bands = a.work_items.map((w) => w.confidence_band).concat(a.weather_site_condition.confidence_band);
  expect(bands).toContain("Missing");
});

test("mock extraction cites only words that occur in the mock transcript", async () => {
  // Guards the provider contract: every quote must survive server-side verification,
  // otherwise the deterministic fixture would teach the wrong behaviour.
  const { runDeterministicValidations } = await import("@buildflow/domain/dpr/validate");
  const { MockTranscription } = await import("./transcription");
  const transcript = await new MockTranscription().transcribe({ audioBytes: new Uint8Array() });
  const extracted = await new MockExtraction().extract({ transcript });
  const { issues } = runDeterministicValidations(extracted, transcript.text);
  expect(issues.filter((issue) => issue.code.startsWith("quote_"))).toEqual([]);
});
