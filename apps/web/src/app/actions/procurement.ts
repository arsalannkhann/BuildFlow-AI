"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { parseINRToPaise } from "@buildflow/domain/money";
import { currentContext } from "@/app/session";
import {
  addItemToRfq, approvePurchaseOrder, closeRfq, createPoDraftFromRfq, createRfq, recordQuote,
} from "@/core/procurement-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;

async function projectCtx(projectId: string) {
  const db = await getDb();
  const ctx = await currentContext();
  return { db, ctx: { ...ctx, projectId } };
}

export async function createRfqAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  const rfqId = await createRfq(db, ctx, {
    projectId,
    title: str(formData, "title"),
    neededBy: opt(formData, "neededBy"),
    note: opt(formData, "note"),
  });
  redirect(`/projects/${projectId}/procurement/rfqs/${rfqId}`);
}

export async function addRfqItemAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const rfqId = str(formData, "rfqId");
  const { db, ctx } = await projectCtx(projectId);
  await addItemToRfq(db, ctx, {
    rfqId,
    description: str(formData, "description"),
    quantity: str(formData, "quantity"),
    unit: str(formData, "unit"),
    materialId: opt(formData, "materialId"),
  });
  revalidatePath(`/projects/${projectId}/procurement/rfqs/${rfqId}`);
}

export async function recordQuoteAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const rfqId = str(formData, "rfqId");
  const { db, ctx } = await projectCtx(projectId);
  const days = opt(formData, "deliveryDays");
  await recordQuote(db, ctx, {
    rfqItemId: str(formData, "rfqItemId"),
    supplierId: str(formData, "supplierId"),
    ratePaise: parseINRToPaise(str(formData, "rateInr")),
    deliveryDays: days === null ? null : Number(days),
    notes: opt(formData, "notes"),
  });
  revalidatePath(`/projects/${projectId}/procurement/rfqs/${rfqId}`);
}

export async function createPoDraftAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const rfqId = str(formData, "rfqId");
  const { db, ctx } = await projectCtx(projectId);
  const poId = await createPoDraftFromRfq(db, ctx, {
    rfqId,
    supplierId: str(formData, "supplierId"),
    costCodeId: opt(formData, "costCodeId"),
    note: opt(formData, "note"),
  });
  redirect(`/projects/${projectId}/procurement/pos/${poId}`);
}

export async function closeRfqAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const rfqId = str(formData, "rfqId");
  const { db, ctx } = await projectCtx(projectId);
  await closeRfq(db, ctx, rfqId);
  revalidatePath(`/projects/${projectId}/procurement/rfqs/${rfqId}`);
}

export async function approvePoAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const poId = str(formData, "poId");
  const { db, ctx } = await projectCtx(projectId);
  await approvePurchaseOrder(db, ctx, poId);
  revalidatePath(`/projects/${projectId}/procurement/pos/${poId}`);
  revalidatePath(`/projects/${projectId}/budget`);
}
