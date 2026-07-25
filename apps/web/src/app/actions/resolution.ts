"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { confirmResolution, seedOrganizationVocabulary } from "@/core/resolution-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();

/**
 * A reviewer accepts or corrects how a spoken phrase was mapped. The choice is learned as a
 * project alias, so the same words resolve automatically in later reports.
 */
export async function confirmResolutionAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  const reportId = str(formData, "reportId");
  await withTenant(db, ctx, (tx) => confirmResolution(tx, ctx, {
    linkId: str(formData, "linkId"),
    entityId: str(formData, "entityId") || null,
    canonicalValue: str(formData, "canonicalValue") || null,
    learn: formData.get("learn") !== "off",
  }));
  revalidatePath(`/reports/${reportId}`);
}

/** Seeds the shared construction vocabulary for the signed-in organization. */
export async function seedVocabularyAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await withTenant(db, ctx, (tx) => seedOrganizationVocabulary(tx, ctx));
  revalidatePath("/organization");
}
