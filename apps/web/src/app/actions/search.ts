"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { currentContext } from "@/app/session";
import { backfillSearchProjection } from "@/core/search-core";

export async function rebuildSearchIndexAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await withTenant(db, ctx, (tx) => backfillSearchProjection(tx, ctx));
  revalidatePath("/search");
}
