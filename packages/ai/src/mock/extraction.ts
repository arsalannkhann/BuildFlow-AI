import type { ExtractionPort, TranscriptSegment } from "../ports";
import {
  DPR_SCHEMA_VERSION, dprSchema, type DprStructuredData, type SourceRef,
} from "@buildflow/domain/dpr/schema";
import { MOCK_TRANSCRIPT_SEGMENTS, MOCK_TRANSCRIPT_TEXT } from "./transcription";
import {
  ACTIVITIES, BLOCKER_TERMS, DELAYED_TERMS, EQUIPMENT, EXPECTATION_TERMS, FUTURE_TERMS,
  MATERIALS, NEGATION_TERMS, RECEIVED_TERMS, REQUIRED_TERMS, SAFETY_QUALITY_TERMS,
  TOMORROW_TERMS, TRADES, USED_TERMS, WEATHER_TERMS, containsAnyTerm, containsTerm,
  findAllEntries, findEntry,
} from "../site/lexicon";
import { findCountForTerm, findQuantities } from "../site/quantities";

/**
 * Deterministic, transcript-GROUNDED extraction stub.
 *
 * This is not a model and does not pretend to be one. It is the offline floor: rule-based,
 * same input -> same output, no network. What matters is the invariant it enforces — every
 * value it emits was literally spoken in the transcript, and every `quote` it cites is a
 * verbatim substring of that transcript, so it survives `verifyQuoteAnchors()` for ANY input
 * rather than only for one canned recording. Anything it cannot read stays `null` with a
 * `Check`/`Missing` band (rules.md §11: unknown values are marked, never guessed).
 *
 * It is also the baseline the Hinglish eval suite scores against; see `evals/README.md`.
 */

type Clause = { text: string; lower: string };

/** Sentence-ish split that never cuts a decimal ("2.5") or an abbreviation ("cu.m"). */
export function splitClauses(text: string): Clause[] {
  const out: Clause[] = [];
  let start = 0;
  const flush = (end: number) => {
    const slice = text.slice(start, end).trim();
    if (slice.length > 0) out.push({ text: slice, lower: slice.toLowerCase() });
    start = end + 1;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "!" || char === "?" || char === "।" || char === ";" || char === "\n") {
      flush(index);
    } else if (char === ".") {
      const next = text[index + 1];
      // A period only ends a clause when whitespace or end-of-text follows it.
      if (next === undefined || /\s/.test(next)) flush(index);
    }
  }
  flush(text.length);
  return out;
}

const comparable = (value: string): string => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Model-generated segment offsets are a navigation hint only (memory.md §14 — they are not
 * waveform measurements), so a span is attached opportunistically and never required.
 */
function spanFor(clause: string, segments: readonly TranscriptSegment[]) {
  const needle = comparable(clause);
  const hit = segments.find((segment) => {
    const segmentText = comparable(segment.text);
    return segmentText.length > 0 && (needle.includes(segmentText) || segmentText.includes(needle));
  });
  return hit ? { startMs: hit.startMs, endMs: hit.endMs } : undefined;
}

function refs(clause: string, segments: readonly TranscriptSegment[]): SourceRef[] {
  const span = spanFor(clause, segments);
  // The quote is the clause itself: a verbatim substring, so it always verifies.
  return [span ? { quote: clause, transcript_span: span } : { quote: clause }];
}

/** Character offset of a whole-word term inside a clause, or -1. */
function termIndex(lower: string, term: string): number {
  const escaped = term.toLowerCase().replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").exec(lower);
  return match ? match.index : -1;
}

const LOCATION_KEYWORDS = [
  "tower", "block", "wing", "level", "floor", "basement", "podium", "terrace", "roof",
  "footing", "pit", "grid", "flat", "room", "plot", "chhat", "chhad", "column", "beam",
  "wall", "staircase", "lift", "slab", "raft", "lobby", "shaft", "trench",
];

/** Connectives that must not be swallowed into a location string. */
const LOCATION_STOP = new Set([
  "on", "at", "in", "of", "the", "and", "was", "is", "were", "for", "to", "ka", "ki", "ke",
  "se", "aur", "par", "pe", "me", "mein", "about", "approximately", "today", "tomorrow",
  "hua", "hui", "kiya", "gaya",
]);

/**
 * Location read LITERALLY out of the clause ("column C4", "level 3", "basement"). Never a
 * constructed label — an invented "Tower A / Level 3" is exactly the failure mode this
 * whole exercise exists to remove.
 */
export function extractLocation(clause: string): string | null {
  const tokens = [...clause.matchAll(/[\p{L}\p{N}\p{M}]+(?:[.,-][\p{L}\p{N}\p{M}]+)*/gu)]
    .map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
  for (let index = 0; index < tokens.length; index += 1) {
    if (!LOCATION_KEYWORDS.includes(tokens[index].text.toLowerCase())) continue;
    let end = tokens[index].end;
    for (let ahead = index + 1; ahead <= index + 2 && ahead < tokens.length; ahead += 1) {
      const candidate = tokens[ahead].text.toLowerCase();
      if (candidate.length > 10 || LOCATION_STOP.has(candidate)) break;
      if (LOCATION_KEYWORDS.includes(candidate)) { end = tokens[ahead].end; continue; }
      // A qualifier is taken ONLY when it looks like a site identifier — it contains a digit
      // ("C4", "3", "B2") or is a bare letter ("A"). Anything wordier ("completed") is prose
      // and would turn the location into a sentence fragment.
      if (!/\d/.test(candidate) && candidate.length > 1) break;
      if (candidate.length > 6) break;
      end = tokens[ahead].end;
    }
    return clause.slice(tokens[index].start, end);
  }
  return null;
}

/**
 * Work-item description.
 *
 * `location`, `activity` and `quantity` are their own fields, so repeating them inside a
 * whole-sentence description gives a reviewer the same fact three times and buries the work
 * itself. When a location is present, the description is narrowed to the span that covers
 * the activity and the location ("casting of column C4"), in whichever order they were
 * spoken ("basement mein PCC ki dhalai"). With no location there is nothing to narrow
 * against, so the clause stands. The verbatim clause is still cited in `source_refs`.
 */
export function describeWork(clause: string, activityTerm: string, location: string | null): string {
  if (!location) return clause;
  const lower = clause.toLowerCase();
  const activityAt = termIndex(lower, activityTerm);
  const locationAt = lower.indexOf(location.toLowerCase());
  if (activityAt < 0 || locationAt < 0) return clause;
  const start = Math.min(activityAt, locationAt);
  const end = Math.max(activityAt + activityTerm.length, locationAt + location.length);
  const span = clause.slice(start, end).trim();
  if (span.length < 3) return clause;
  return span.charAt(0).toUpperCase() + span.slice(1);
}

const EQUIPMENT_DOWN = [
  "kharab", "breakdown", "broke down", "not working", "band", "repair", "under repair",
  "unavailable", "idle", "puncture", "fault", "faulty",
];

/**
 * A plan is about tomorrow. "kal" / "कल" means BOTH yesterday and tomorrow in Hindi, so it
 * only counts as a plan alongside a future marker — otherwise yesterday's work would be
 * filed as tomorrow's plan.
 */
function isPlanClause(lower: string): boolean {
  if (containsAnyTerm(lower, TOMORROW_TERMS)) return true;
  const ambiguousTomorrow = containsTerm(lower, "kal") || containsTerm(lower, "कल");
  return ambiguousTomorrow && containsAnyTerm(lower, FUTURE_TERMS);
}

function materialStatus(lower: string, negated: boolean):
{ status: "received" | "used" | "delayed" | "required" | null; derived: boolean } {
  const claimsArrival = containsAnyTerm(lower, RECEIVED_TERMS);
  // Negated arrival is the most damaging mis-read on an Indian site: "cement nahi aaya" must
  // never surface as received. It becomes `delayed` and is marked as derived, not stated.
  if (negated && claimsArrival) return { status: "delayed", derived: true };
  if (claimsArrival) return { status: "received", derived: false };
  if (containsAnyTerm(lower, USED_TERMS)) return { status: "used", derived: false };
  if (containsAnyTerm(lower, DELAYED_TERMS)) return { status: "delayed", derived: false };
  if (containsAnyTerm(lower, REQUIRED_TERMS)) return { status: "required", derived: false };
  return { status: null, derived: false };
}

function readTranscript(input: unknown): { text: string; segments: readonly TranscriptSegment[] } {
  const supplied = input as { text?: unknown; segments?: unknown } | null | undefined;
  const text = typeof supplied?.text === "string" && supplied.text.trim().length > 0
    ? supplied.text
    : MOCK_TRANSCRIPT_TEXT;
  const segments = Array.isArray(supplied?.segments)
    ? (supplied.segments as TranscriptSegment[])
    : (text === MOCK_TRANSCRIPT_TEXT ? MOCK_TRANSCRIPT_SEGMENTS : []);
  return { text, segments };
}

/** Pure and exported: the eval runner and the tests call this directly. */
export function extractDeterministically(transcript: {
  text: string; segments?: readonly TranscriptSegment[];
}): DprStructuredData {
  const segments = transcript.segments ?? [];
  const data: DprStructuredData = {
    schema_version: DPR_SCHEMA_VERSION,
    work_items: [], labour: [], materials: [], equipment: [], safety_quality: [],
    blockers: [],
    weather_site_condition: { value: null, source_refs: [], confidence_band: "Missing" },
    tomorrow_plan: [],
  };

  const labourByTrade = new Map<string, { count: number | null; clause: string }>();
  const seenBlockers = new Set<string>();
  const seenMaterials = new Set<string>();
  const seenEquipment = new Set<string>();

  for (const clause of splitClauses(transcript.text)) {
    const { text, lower } = clause;
    const negated = containsAnyTerm(lower, NEGATION_TERMS);
    const plan = isPlanClause(lower);
    const quantities = findQuantities(text).filter((quantity) => quantity.unit !== null);
    const source = () => refs(text, segments);

    // ---- tomorrow plan (a plan is never today's work) ---------------------------------
    if (plan) {
      data.tomorrow_plan.push({ item: text, source_refs: source(), confidence_band: "Supported" });
    }

    // ---- work items -------------------------------------------------------------------
    const activityHits = findAllEntries(lower, ACTIVITIES);
    const activity = activityHits[0] ?? null;
    if (activity && !plan && !negated) {
      // One clause usually reports one activity. When it clearly reports SEVERAL measured
      // activities ("320 cft brickwork and 95 sqm plaster"), split them and give each the
      // quantity spoken next to it — otherwise the second measurement is silently dropped.
      const split = activityHits.length > 1 && quantities.length > 1;
      const chosen = split ? activityHits : [activity];
      const location = extractLocation(text);
      for (const hit of chosen) {
        const at = termIndex(lower, hit.term);
        const nearest = split
          ? [...quantities].reverse().find((quantity) => quantity.index < at)
            ?? quantities.find((quantity) => quantity.index > at)
          : quantities[0];
        data.work_items.push({
          description: describeWork(text, hit.term, location),
          location,
          activity: hit.canonical,
          quantity: { value: nearest?.value ?? null, unit: nearest?.unit ?? null },
          source_refs: source(),
          // Without a stated quantity the item claims activity only — reviewable, not proven.
          confidence_band: nearest ? "Supported" : "Check",
        });
      }
    }

    // ---- labour -----------------------------------------------------------------------
    if (!negated) {
      for (const trade of findAllEntries(lower, TRADES)) {
        const count = findCountForTerm(text, trade.term);
        const existing = labourByTrade.get(trade.canonical);
        if (!existing || (existing.count === null && count !== null)) {
          labourByTrade.set(trade.canonical, { count, clause: text });
        }
      }
    }

    // ---- materials --------------------------------------------------------------------
    const materialHits = findAllEntries(lower, MATERIALS);
    for (const material of materialHits) {
      if (seenMaterials.has(material.canonical)) continue;
      seenMaterials.add(material.canonical);
      const { status, derived } = materialStatus(lower, negated);
      // Quantity association: a single material in the clause takes the first stated
      // quantity; several materials each take the quantity spoken immediately before them.
      const at = termIndex(lower, material.term);
      const preceding = [...quantities].reverse().find((quantity) => quantity.index < at);
      const quantity = materialHits.length === 1 ? quantities[0] : preceding;
      data.materials.push({
        name: material.canonical,
        status,
        quantity: quantity ? { value: quantity.value, unit: quantity.unit } : null,
        unit: quantity?.unit ?? null,
        source_refs: source(),
        confidence_band: status === null || derived ? "Check" : "Supported",
      });
    }

    // ---- equipment --------------------------------------------------------------------
    for (const machine of findAllEntries(lower, EQUIPMENT)) {
      if (seenEquipment.has(machine.canonical)) continue;
      seenEquipment.add(machine.canonical);
      const down = containsAnyTerm(lower, EQUIPMENT_DOWN);
      const used = containsAnyTerm(lower, USED_TERMS) || (activity !== null && !negated);
      const status = down || (negated && !used) ? "unavailable" as const
        : used ? "used" as const : null;
      data.equipment.push({
        name: machine.canonical, status,
        source_refs: source(),
        confidence_band: down || (used && !negated) ? "Supported" : "Check",
      });
    }

    // ---- safety and quality -----------------------------------------------------------
    if (containsAnyTerm(lower, SAFETY_QUALITY_TERMS)) {
      data.safety_quality.push({ note: text, source_refs: source(), confidence_band: "Supported" });
    }

    // ---- blockers ---------------------------------------------------------------------
    // A clause can name tomorrow AND still report today's blocker ("the mixer broke down,
    // the mechanic comes tomorrow"), so a plan never suppresses a blocker.
    const blockerSignal = containsAnyTerm(lower, BLOCKER_TERMS)
      || (negated && (
        materialHits.length > 0
        || activity !== null
        || findEntry(lower, EQUIPMENT) !== null
        || containsAnyTerm(lower, EXPECTATION_TERMS)
      ));
    if (blockerSignal && !seenBlockers.has(lower)) {
      seenBlockers.add(lower);
      data.blockers.push({
        description: text, cause: null, owner: null, expected_resolution: null,
        source_refs: source(),
        // A blocker read off a keyword is an interpretation, so a human confirms it.
        confidence_band: "Check",
      });
    }

    // ---- weather / site condition -----------------------------------------------------
    if (data.weather_site_condition.value === null && containsAnyTerm(lower, WEATHER_TERMS)) {
      data.weather_site_condition = {
        value: text, source_refs: source(), confidence_band: "Supported",
      };
    }
  }

  for (const [trade, { count, clause }] of labourByTrade) {
    data.labour.push({
      trade, count, source_refs: refs(clause, segments),
      confidence_band: count === null ? "Check" : "Supported",
    });
  }

  // The same central schema gate the pipeline applies to real providers.
  return dprSchema.parse(data);
}

export class MockExtraction implements ExtractionPort {
  // model bumped to -2: the stub now reads the transcript instead of replaying a fixed report.
  readonly meta = { provider: "mock", model: "mock-extract-2", promptVersion: "dpr-extraction.v2" };

  async extract(input: { transcript: unknown }): Promise<DprStructuredData> {
    return extractDeterministically(readTranscript(input.transcript));
  }
}
