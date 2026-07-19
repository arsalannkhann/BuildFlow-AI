"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { backfillSearchProjection } from "@/core/search-core";

export async function rebuildSearchIndexAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await backfillSearchProjection(db, ctx);
  revalidatePath("/search");
}
