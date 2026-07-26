import { createHash } from "node:crypto";
import type { PhotoTaggingPort } from "../ports";
import {
  PHOTO_TAG_SCHEMA_VERSION, SUPPORTED_PHOTO_MIME, clampWorkItemMatch, photoTagSchema,
  type PhotoTag,
} from "../photos/schema";
import { PHOTO_TAGGING_PROMPT_VERSION } from "../photos/prompt";

/**
 * Deterministic photo tagging: no network, same bytes always give the same caption, and it
 * honours the same contract gates as the real provider (unsupported mime -> null, match
 * index range-checked). Every fixture below is SYNTHETIC (rules.md §14 — no customer
 * content in fixtures).
 *
 * The match is decided by literal token overlap with the supplied work-item descriptions.
 * That is deliberately dumb: a stub that guessed a match would teach the pipeline and its
 * tests that invented evidence is normal.
 */

type PhotoFixture = { caption: string; tags: string[] };

const FIXTURES: readonly PhotoFixture[] = [
  {
    caption: "Column reinforcement cage tied and ready for shuttering",
    tags: ["column", "reinforcement", "sariya", "shuttering"],
  },
  {
    caption: "Slab concrete pour underway with hose and needle vibrator",
    tags: ["slab", "dhalai", "concrete", "pour", "vibrator"],
  },
  {
    caption: "Brick masonry raised to lintel height in one bay",
    tags: ["brickwork", "chinai", "masonry", "lintel"],
  },
  {
    caption: "Cement bags stacked on a raised platform under cover",
    tags: ["cement", "bags", "storage", "material"],
  },
  {
    caption: "Excavated pit with timber shoring along the near edge",
    tags: ["excavation", "khudai", "pit", "shoring"],
  },
  {
    caption: "Plastered wall face with fresh curing water marks",
    tags: ["plaster", "curing", "wall", "finishing"],
  },
];

/** Generic words that prove nothing about WHICH work item a photo shows. */
const WEAK_TOKENS = new Set([
  "work", "works", "site", "area", "level", "floor", "part", "side", "near", "with", "under",
  "cover", "fresh", "ready", "underway", "progress", "today", "tomorrow", "material",
  "materials", "done", "complete", "completed", "started", "start", "about", "along", "edge",
  "face", "marks", "height", "cage", "tied", "raised", "stacked", "platform", "timber",
  "needle", "hose", "one", "bay", "and", "the", "for", "from", "into", "over",
]);

const MIN_TOKEN_LENGTH = 4;

/** Lowercased word tokens with a crude plural fold so "bags" matches "bag". */
function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u)) {
    if (raw.length < MIN_TOKEN_LENGTH) continue;
    const token = raw.endsWith("s") && raw.length > MIN_TOKEN_LENGTH ? raw.slice(0, -1) : raw;
    if (WEAK_TOKENS.has(raw) || WEAK_TOKENS.has(token)) continue;
    out.add(token);
  }
  return out;
}

/**
 * Highest literal token overlap wins; a tie goes to the earliest work item; ZERO overlap
 * returns null. An unmatchable photo is a normal outcome, not a failure to paper over.
 */
export function matchWorkItemByTokens(
  fixture: PhotoFixture, workItemDescriptions: string[],
): number | null {
  const photoTokens = tokens([fixture.caption, ...fixture.tags].join(" "));
  let bestIndex: number | null = null;
  let bestScore = 0;
  workItemDescriptions.forEach((description, index) => {
    let score = 0;
    for (const token of tokens(description)) if (photoTokens.has(token)) score += 1;
    if (score > bestScore) { bestScore = score; bestIndex = index; }
  });
  return bestScore > 0 ? bestIndex : null;
}

/** Stable fixture choice: the same photo always gets the same caption. */
function pickFixture(imageBytes: Uint8Array): PhotoFixture {
  const digest = createHash("sha256").update(imageBytes).digest();
  return FIXTURES[digest[0] % FIXTURES.length];
}

export class MockPhotoTagging implements PhotoTaggingPort {
  readonly meta = {
    provider: "mock", model: "mock-photo-1", promptVersion: PHOTO_TAGGING_PROMPT_VERSION,
  };

  async tagPhoto({ imageBytes, contentType, workItemDescriptions }: {
    imageBytes: Uint8Array; contentType: string; workItemDescriptions: string[];
  }): Promise<PhotoTag | null> {
    if (!SUPPORTED_PHOTO_MIME.test(contentType)) return null; // same gate as a real provider
    const fixture = pickFixture(imageBytes);
    const tag = photoTagSchema.parse({
      schema_version: PHOTO_TAG_SCHEMA_VERSION,
      caption: fixture.caption,
      tags: fixture.tags,
      matches_work_item_index: matchWorkItemByTokens(fixture, workItemDescriptions),
    });
    return clampWorkItemMatch(tag, workItemDescriptions.length);
  }
}
