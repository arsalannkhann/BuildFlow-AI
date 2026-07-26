import type { DprStructuredData, SourceRef } from "./schema";

export type ValidationIssue = { code: string; path: string; message: string };

/**
 * Whitespace-insensitive, case-insensitive comparison text. Providers reflow line breaks
 * and casing when they echo a quote, so an exact `includes` would reject honest quotes;
 * this normalisation keeps the check strict about WORDS without being brittle about layout.
 */
const normalize = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

/** Curly/smart punctuation is frequently substituted by the model; fold it to ASCII. */
const foldPunctuation = (value: string): string =>
  value.replaceAll(/[‘’‛]/g, "'")
    .replaceAll(/[“”]/g, '"')
    .replaceAll(/[‐-―]/g, "-");

const comparable = (value: string): string => normalize(foldPunctuation(value));

const MIN_QUOTE_LENGTH = 3;

/**
 * Verifies every `quote` source reference against the transcript it claims to come from.
 *
 * A quote that does not occur in the transcript is a fabricated anchor: it is REMOVED and
 * the owning item drops to `Check`, so a reviewer is asked to confirm rather than being
 * shown invented provenance. The extraction is never discarded wholesale — the rest of the
 * report is still the engineer's work (rules.md §11: unsupported values are marked, not
 * guessed; a confidence band never bypasses human review).
 */
export function verifyQuoteAnchors(
  input: DprStructuredData,
  transcriptText: string | null | undefined,
): { data: DprStructuredData; issues: ValidationIssue[]; removed: number } {
  const data = structuredClone(input);
  const issues: ValidationIssue[] = [];
  let removed = 0;
  const haystack = transcriptText ? comparable(transcriptText) : "";

  const checkRefs = (refs: SourceRef[], path: string): boolean => {
    let dropped = false;
    for (const ref of refs) {
      if (ref.quote === undefined) continue;
      const needle = comparable(ref.quote);
      // Too-short quotes ("C4", "6") match by accident and prove nothing.
      const verifiable = needle.length >= MIN_QUOTE_LENGTH;
      if (verifiable && haystack.length > 0 && haystack.includes(needle)) continue;
      delete ref.quote;
      dropped = true;
      removed += 1;
      issues.push({
        code: verifiable ? "quote_not_in_transcript" : "quote_too_short",
        path,
        message: verifiable
          ? "Cited words do not appear in the transcript; the citation was removed."
          : "Citation was too short to verify; it was removed.",
      });
    }
    return dropped;
  };

  type Banded = { confidence_band: DprStructuredData["work_items"][number]["confidence_band"] };
  const demote = (item: Banded) => {
    if (item.confidence_band === "Supported") item.confidence_band = "Check";
  };

  const sections: [string, (Banded & { source_refs: SourceRef[] })[]][] = [
    ["work_items", data.work_items],
    ["labour", data.labour],
    ["materials", data.materials],
    ["equipment", data.equipment],
    ["safety_quality", data.safety_quality],
    ["blockers", data.blockers],
    ["tomorrow_plan", data.tomorrow_plan],
  ];

  for (const [name, rows] of sections) {
    rows.forEach((row, index) => {
      if (checkRefs(row.source_refs, `${name}[${index}]`)) demote(row);
    });
  }
  if (checkRefs(data.weather_site_condition.source_refs, "weather_site_condition")) {
    demote(data.weather_site_condition);
  }

  return { data, issues, removed };
}

/** Media quality facts the deterministic checks reason about (T3.2). */
export type AudioQualityInput = {
  /** Measured recording length, or null when it could not be determined. */
  durationMs?: number | null;
  /** The transcript produced from that recording. */
  transcriptText?: string | null;
};

/** Below this, a "daily update" is almost certainly a mis-tap or an interrupted recording. */
export const MIN_PLAUSIBLE_AUDIO_MS = 10_000;
/** Sparseness is only meaningful once there is enough audio to be sparse ACROSS. */
export const SPARSE_AUDIO_MIN_MS = 20_000;
/** Unhurried Indian site speech still clears ~80 wpm; 20 wpm means mostly silence or noise. */
export const MIN_WORDS_PER_MINUTE = 20;

const wordCount = (text: string): number =>
  text.split(/[^\p{L}\p{N}\p{M}]+/u).filter((token) => token.length > 0).length;

/**
 * Deterministic recording-quality signals (T3.2).
 *
 * A six-second recording produces a thin report, and the failure is invisible: the draft
 * looks like any other draft, just emptier. This turns that into an explicit warning for the
 * reviewer.
 *
 * It NEVER rejects. The engineer's recording is real work and stays exactly as captured —
 * the output is a warning plus a confidence downgrade, and a human decides
 * (rules.md §11: a confidence band never bypasses human review).
 *
 * A null/unknown duration produces no issue: silence is better than a guess.
 */
export function assessAudioQuality(audio: AudioQualityInput | null | undefined): ValidationIssue[] {
  if (!audio) return [];
  const { durationMs } = audio;
  if (durationMs === null || durationMs === undefined || !Number.isFinite(durationMs)) return [];
  const issues: ValidationIssue[] = [];
  const seconds = Math.max(0, Math.round(durationMs / 1000));

  if (durationMs < MIN_PLAUSIBLE_AUDIO_MS) {
    issues.push({
      code: "audio_too_short",
      path: "attachments.audio",
      message: `${seconds}-second recording — likely an incomplete update. Nothing was rejected; check the report covers the whole day.`,
    });
  }

  const words = wordCount(audio.transcriptText ?? "");
  const minutes = durationMs / 60_000;
  if (durationMs >= SPARSE_AUDIO_MIN_MS && minutes > 0) {
    const wordsPerMinute = words / minutes;
    if (wordsPerMinute < MIN_WORDS_PER_MINUTE) {
      issues.push({
        code: "transcript_sparse_for_duration",
        path: "transcript",
        message: `Only ${words} words were transcribed from ${seconds} seconds of audio — site noise may have drowned out the update. Listen to the recording before approving.`,
      });
    }
  }

  return issues;
}

/**
 * Applies the recording-quality signals to a draft: items that would otherwise read as
 * proven drop to `Check` so the reviewer is asked to confirm them. Nothing is removed and no
 * value is altered.
 */
export function applyAudioQualitySignals(
  input: DprStructuredData,
  audio: AudioQualityInput | null | undefined,
): { data: DprStructuredData; issues: ValidationIssue[] } {
  const issues = assessAudioQuality(audio);
  const data = structuredClone(input);
  if (issues.length === 0) return { data, issues };

  type Banded = { confidence_band: DprStructuredData["work_items"][number]["confidence_band"] };
  const demote = (item: Banded) => {
    if (item.confidence_band === "Supported") item.confidence_band = "Check";
  };
  const rows: Banded[] = [
    ...data.work_items, ...data.labour, ...data.materials, ...data.equipment,
    ...data.safety_quality, ...data.blockers, ...data.tomorrow_plan,
    data.weather_site_condition,
  ];
  for (const row of rows) demote(row);
  return { data, issues };
}

export function runDeterministicValidations(
  input: DprStructuredData,
  transcriptText?: string | null,
  audio?: AudioQualityInput | null,
): { data: DprStructuredData; issues: ValidationIssue[] } {
  const verified = verifyQuoteAnchors(input, transcriptText);
  const quality = applyAudioQualitySignals(verified.data, audio);
  const data = quality.data;
  const issues = [...verified.issues, ...quality.issues];

  data.work_items.forEach((w, i) => {
    if (w.quantity.value !== null && w.quantity.unit === null) {
      issues.push({ code: "quantity_missing_unit", path: `work_items[${i}]`,
        message: "Quantity has a value but no unit." });
      if (w.confidence_band === "Supported") w.confidence_band = "Check";
    }
  });

  return { data, issues };
}
