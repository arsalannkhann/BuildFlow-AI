import type { TranscriptSegment, TranscriptionPort, TranscriptResult } from "../ports";

const CANNED = "Today we completed casting of column C4 on level 3, about 2.5 cubic meters of concrete. " +
  "Six masons and four helpers worked. Cement delivery is delayed. Tomorrow we plan slab shuttering.";

/**
 * Exported so the deterministic extraction stub can fall back to this text when a caller
 * passes no transcript at all. One canned recording in one place keeps the two mocks from
 * drifting apart and silently breaking quote verification.
 */
export const MOCK_TRANSCRIPT_TEXT = CANNED;

export const MOCK_TRANSCRIPT_SEGMENTS: readonly TranscriptSegment[] = [
  { text: "completed casting of column C4 on level 3, about 2.5 cubic meters", startMs: 1000, endMs: 6000 },
  { text: "Six masons and four helpers worked", startMs: 6000, endMs: 9000 },
  { text: "Cement delivery is delayed", startMs: 9000, endMs: 11000 },
  { text: "Tomorrow we plan slab shuttering", startMs: 11000, endMs: 14000 },
];

export class MockTranscription implements TranscriptionPort {
  async transcribe(_input: { audioBytes: Uint8Array }): Promise<TranscriptResult> {
    return {
      text: CANNED, language: "en",
      segments: MOCK_TRANSCRIPT_SEGMENTS.map((segment) => ({ ...segment })),
    };
  }
}
