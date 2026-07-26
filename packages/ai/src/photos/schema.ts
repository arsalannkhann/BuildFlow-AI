import { z } from "zod";

/**
 * Photo tagging output (T3.1). A photo is EVIDENCE, never a claim: this schema can express
 * a caption, free tags, and a pointer to a work item the photo appears to show — and
 * nothing that could change a quantity, a progress figure, or a status. That boundary is
 * structural, not a prompt promise (rules.md §11: no visual progress percentage as fact).
 */
export const PHOTO_TAG_SCHEMA_VERSION = "photo-tag.v1" as const;

export const photoTagSchema = z.object({
  schema_version: z.literal(PHOTO_TAG_SCHEMA_VERSION),
  /** One short line describing what is visible. Not a measurement, not an assessment. */
  caption: z.string().trim().min(1).max(240),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  /**
   * Index into the work-item descriptions supplied by the caller, or null. The model may
   * only choose from that list; it can never name a work item of its own invention.
   */
  matches_work_item_index: z.number().int().nonnegative().nullable(),
});

export type PhotoTag = z.infer<typeof photoTagSchema>;

/**
 * Range gate applied to EVERY provider result. An index outside the supplied list is not a
 * match the caller can honour — it is a fabricated pointer, so it degrades to "no match"
 * rather than throwing away the caption or, worse, citing the wrong work item.
 */
export function clampWorkItemMatch(tag: PhotoTag, workItemCount: number): PhotoTag {
  const index = tag.matches_work_item_index;
  if (index === null) return tag;
  if (!Number.isInteger(index) || index < 0 || index >= workItemCount) {
    return { ...tag, matches_work_item_index: null };
  }
  return tag;
}

/** Mime types a multimodal image call can actually read. Anything else returns null. */
export const SUPPORTED_PHOTO_MIME = /^image\/(jpeg|png|webp|gif)$/;
