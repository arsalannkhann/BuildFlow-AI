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

export function runDeterministicValidations(
  input: DprStructuredData,
  transcriptText?: string | null,
): { data: DprStructuredData; issues: ValidationIssue[] } {
  const verified = verifyQuoteAnchors(input, transcriptText);
  const data = verified.data;
  const issues = [...verified.issues];

  data.work_items.forEach((w, i) => {
    if (w.quantity.value !== null && w.quantity.unit === null) {
      issues.push({ code: "quantity_missing_unit", path: `work_items[${i}]`,
        message: "Quantity has a value but no unit." });
      if (w.confidence_band === "Supported") w.confidence_band = "Check";
    }
  });

  return { data, issues };
}
