"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { LocalFsStorage } from "@buildflow/storage/local-fs";
import { parseINRToPaise } from "@buildflow/domain/money";
import { currentContext } from "@/app/session";
import {
  addManualReceiptLine, createMaterial, createReceipt, createSupplier, deleteReceiptLine,
  editReceiptLine, markReceiptReviewed, postReceipt, recordStockMovement, updateMaterialDetails,
} from "@/core/materials-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string): string | null => str(fd, key) || null;
const optPaise = (fd: FormData, key: string): number | null => {
  const v = opt(fd, key);
  return v === null ? null : parseINRToPaise(v);
};

async function projectCtx(projectId: string) {
  const db = await getDb();
  const ctx = await currentContext();
  return { db, ctx: { ...ctx, projectId } };
}

export async function createMaterialAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await createMaterial(db, ctx, {
    name: str(formData, "name"),
    unit: str(formData, "unit"),
    hsnCode: opt(formData, "hsnCode"),
    reorderThreshold: opt(formData, "reorderThreshold"),
  });
  revalidatePath(`/projects/${projectId}/materials`);
}

export async function updateMaterialAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await updateMaterialDetails(db, ctx, str(formData, "materialId"), {
    reorderThreshold: opt(formData, "reorderThreshold"),
  });
  revalidatePath(`/projects/${projectId}/materials`);
}

export async function createSupplierAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await createSupplier(db, ctx, {
    name: str(formData, "name"),
    gstin: opt(formData, "gstin"),
    phone: opt(formData, "phone"),
    projectId,
  });
  revalidatePath(`/projects/${projectId}/materials`);
}

export async function createReceiptAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  const upload = formData.get("photo") as File | null;
  const receiptId = await createReceipt(db, new LocalFsStorage(), ctx, {
    projectId,
    receiptDate: str(formData, "receiptDate"),
    supplierId: opt(formData, "supplierId"),
    challanNumber: opt(formData, "challanNumber"),
    note: opt(formData, "note"),
    photo: upload && upload.size > 0 ? {
      bytes: new Uint8Array(await upload.arrayBuffer()),
      fileName: upload.name, contentType: upload.type || "application/octet-stream",
    } : undefined,
  });
  redirect(`/projects/${projectId}/materials/receipts/${receiptId}`);
}

export async function addReceiptLineAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const receiptId = str(formData, "receiptId");
  const { db, ctx } = await projectCtx(projectId);
  await addManualReceiptLine(db, ctx, {
    receiptId,
    descriptionRaw: str(formData, "descriptionRaw"),
    quantity: str(formData, "quantity"),
    unit: str(formData, "unit"),
    materialId: opt(formData, "materialId"),
    ratePaise: optPaise(formData, "rateInr"),
  });
  revalidatePath(`/projects/${projectId}/materials/receipts/${receiptId}`);
}

export async function editReceiptLineAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const receiptId = str(formData, "receiptId");
  const { db, ctx } = await projectCtx(projectId);
  await editReceiptLine(db, ctx, str(formData, "lineId"), {
    materialId: opt(formData, "materialId"),
    quantity: str(formData, "quantity") || undefined,
    unit: str(formData, "unit") || undefined,
  });
  revalidatePath(`/projects/${projectId}/materials/receipts/${receiptId}`);
}

export async function deleteReceiptLineAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const receiptId = str(formData, "receiptId");
  const { db, ctx } = await projectCtx(projectId);
  await deleteReceiptLine(db, ctx, str(formData, "lineId"));
  revalidatePath(`/projects/${projectId}/materials/receipts/${receiptId}`);
}

export async function markReceiptReviewedAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const receiptId = str(formData, "receiptId");
  const { db, ctx } = await projectCtx(projectId);
  await markReceiptReviewed(db, ctx, receiptId);
  revalidatePath(`/projects/${projectId}/materials/receipts/${receiptId}`);
}

export async function postReceiptAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const receiptId = str(formData, "receiptId");
  const { db, ctx } = await projectCtx(projectId);
  await postReceipt(db, ctx, receiptId);
  revalidatePath(`/projects/${projectId}/materials/receipts/${receiptId}`);
  revalidatePath(`/projects/${projectId}/materials`);
}

export async function recordStockMovementAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await recordStockMovement(db, ctx, {
    projectId,
    materialId: str(formData, "materialId"),
    kind: str(formData, "kind"),
    quantity: str(formData, "quantity"),
    note: opt(formData, "note"),
  });
  revalidatePath(`/projects/${projectId}/materials`);
}
