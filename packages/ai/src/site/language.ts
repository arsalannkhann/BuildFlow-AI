/**
 * Re-export of the language signals now owned by `@buildflow/domain/resolve/language`.
 *
 * WHY THIS FILE STILL EXISTS: the marker list is site vocabulary and belongs beside the alias
 * dictionary, but `@buildflow/ai/site/language` is an established import path — the pipeline's
 * transcript-normalization stage, both provider adapters and the normalization schema all
 * reach for it. Moving the implementation without leaving this path in place would be a
 * breaking change to modules this work is not allowed to touch.
 */

export {
  detectNormalizationNeed, hasDevanagari, hinglishMarkers, tokenize, HINGLISH_MARKERS,
} from "@buildflow/domain/resolve/language";
export type {
  NormalizationNeed, NormalizationReason,
} from "@buildflow/domain/resolve/language";
