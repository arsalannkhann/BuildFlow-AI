import type { AiRegistry } from "@buildflow/ai/registry";
import type { DprStructuredData } from "@buildflow/domain/dpr/schema";
import type { StoragePort } from "@buildflow/storage/port";

/**
 * Photo -> work-item evidence linking (T3.1).
 *
 * Until now `source_refs[].attachment_id` was dead weight: photos were uploaded, stored and
 * shown, but nothing connected a photo to the claim it evidences. This stage asks the photo
 * port to caption each photo and, at most, point at ONE of the work items the engineer
 * already reported, then writes that attachment id into that work item's `source_refs`.
 *
 * Invariants, enforced structurally rather than by prompt:
 *   - Only `source_refs` is ever touched. Quantities, descriptions, statuses, counts and
 *     confidence bands are copied through untouched — a photo is evidence for a claim, never
 *     a source of one (rules.md §11).
 *   - A match may only be an index into the descriptions supplied to the port; anything else
 *     is discarded by `clampWorkItemMatch` before it reaches this code.
 *   - Per-photo failures (missing object, provider error, unreadable mime) are counted and
 *     skipped. A photo is optional evidence; losing it must never cost the engineer the
 *     whole update.
 */

/** Cost and latency cap. Site engineers routinely attach a dozen photos to one update. */
export const DEFAULT_MAX_PHOTOS_TAGGED = 6;

export type TaggablePhoto = { id: string; objectKey: string; contentType: string };

export type PhotoEvidence = {
  attachmentId: string;
  caption: string;
  tags: string[];
  /** Index of the work item this photo was attached to, or null when nothing matched. */
  workItemIndex: number | null;
};

export type PhotoEvidenceResult = {
  data: DprStructuredData;
  evidence: PhotoEvidence[];
  /** Photos considered after the cap. */
  considered: number;
  /** Photos the provider could actually read. */
  tagged: number;
  /** Photos attached to a work item. */
  linked: number;
  /** Photos skipped because of a storage or provider error. */
  failed: number;
};

function maxPhotos(): number {
  // Note the explicit emptiness check: `Number("")` is 0, which would silently disable photo
  // tagging everywhere the variable is simply unset.
  const raw = process.env.PHOTO_TAGGING_MAX?.trim();
  if (!raw) return DEFAULT_MAX_PHOTOS_TAGGED;
  const configured = Number(raw);
  return Number.isInteger(configured) && configured >= 0 ? configured : DEFAULT_MAX_PHOTOS_TAGGED;
}

export async function attachPhotoEvidence(input: {
  ai: AiRegistry;
  storage: StoragePort;
  data: DprStructuredData;
  photos: TaggablePhoto[];
  limit?: number;
}): Promise<PhotoEvidenceResult> {
  const data = structuredClone(input.data);
  const limit = input.limit ?? maxPhotos();
  // Stable order so a retry of the same report tags the same photos.
  const candidates = [...input.photos].sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
  const evidence: PhotoEvidence[] = [];
  let tagged = 0;
  let linked = 0;
  let failed = 0;

  if (candidates.length === 0 || data.work_items.length === 0) {
    // With no work items there is nothing a photo could evidence; do not spend model calls.
    return { data, evidence, considered: 0, tagged: 0, linked: 0, failed: 0 };
  }

  const descriptions = data.work_items.map((item) => item.description);

  for (const photo of candidates) {
    try {
      const imageBytes = await input.storage.get(photo.objectKey);
      const tag = await input.ai.photos.tagPhoto({
        imageBytes, contentType: photo.contentType, workItemDescriptions: descriptions,
      });
      if (!tag) continue; // unsupported mime — the photo stays, it just carries no tags
      tagged += 1;

      const index = tag.matches_work_item_index;
      if (index !== null && index >= 0 && index < data.work_items.length) {
        const refs = data.work_items[index].source_refs;
        if (!refs.some((ref) => ref.attachment_id === photo.id)) {
          refs.push({ attachment_id: photo.id });
        }
        linked += 1;
      }
      evidence.push({
        attachmentId: photo.id, caption: tag.caption, tags: tag.tags,
        workItemIndex: index,
      });
    } catch {
      failed += 1;
    }
  }

  return { data, evidence, considered: candidates.length, tagged, linked, failed };
}
