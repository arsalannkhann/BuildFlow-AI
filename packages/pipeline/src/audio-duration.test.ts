import { expect, test } from "vitest";
import { probeAudioDuration, probeAudioDurationMs } from "./audio-duration";
import { synthesizeWebm } from "./audio-fixture";

test("reads the declared duration out of a WebM container", () => {
  const probe = probeAudioDuration(synthesizeWebm(6_000));
  expect(probe).toEqual({ durationMs: 6000, source: "ebml_duration", approximate: false });
});

test("reads a WAV duration from its byte rate and data size", () => {
  // 1 second of 8-bit mono 8 kHz = 8000 bytes of data at a byte rate of 8000.
  const dataBytes = 8000;
  const header = new Uint8Array(44 + dataBytes);
  const view = new DataView(header.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) header[offset + index] = text.charCodeAt(index);
  };
  write(0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); // sampleRate, byteRate
  view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  write(36, "data"); view.setUint32(40, dataBytes, true);

  expect(probeAudioDurationMs(header)).toBe(1000);
});

test("returns null rather than guessing when the bytes carry no duration", () => {
  // Honesty check: an unknown duration must never become an estimated one.
  expect(probeAudioDurationMs(new TextEncoder().encode("not audio at all"))).toBeNull();
  expect(probeAudioDurationMs(new Uint8Array())).toBeNull();
});

test("survives a truncated container without throwing", () => {
  const truncated = synthesizeWebm(30_000).slice(0, 9);
  expect(() => probeAudioDurationMs(truncated)).not.toThrow();
});
