import type { TranscriptionPort, TranscriptResult } from "../ports";

const CANNED = "Today we completed casting of column C4 on level 3, about 2.5 cubic meters of concrete. " +
  "Six masons and four helpers worked. Cement delivery is delayed. Tomorrow we plan slab shuttering.";

export class MockTranscription implements TranscriptionPort {
  async transcribe(_input: { audioBytes: Uint8Array }): Promise<TranscriptResult> {
    return {
      text: CANNED, language: "en",
      segments: [
        { text: "completed casting of column C4 on level 3, about 2.5 cubic meters", startMs: 1000, endMs: 6000 },
        { text: "Six masons and four helpers worked", startMs: 6000, endMs: 9000 },
        { text: "Cement delivery is delayed", startMs: 9000, endMs: 11000 },
        { text: "Tomorrow we plan slab shuttering", startMs: 11000, endMs: 14000 },
      ],
    };
  }
}
