"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { withTenant } from "@buildflow/db/tenant";
import { getStorage } from "@buildflow/storage/factory";
import { parseINRToPaise } from "@buildflow/domain/money";
import { currentContext } from "@/app/session";
import { createCostCode, importBudgetCsv } from "@/core/budget-core";
import {
  addManualInvoiceLine, approveInvoice, createInvoice, deleteInvoiceLine, editInvoiceLine,
  markInvoiceReviewed, recordPayment, updateInvoiceHeader,
} from "@/core/invoices-core";

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

export async function createCostCodeAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => createCostCode(tx, ctx, { code: str(formData, "code"), name: str(formData, "name") }));
  revalidatePath(`/projects/${projectId}/budget`);
}

export async function importBudgetCsvAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  const upload = formData.get("csv") as File | null;
  if (!upload || upload.size === 0) throw new Error("Choose a CSV file");
  await withTenant(db, ctx, async (tx) => importBudgetCsv(tx, ctx, projectId, await upload.text(), opt(formData, "note") ?? undefined));
  revalidatePath(`/projects/${projectId}/budget`);
}

export async function createInvoiceAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const { db, ctx } = await projectCtx(projectId);
  const upload = formData.get("photo") as File | null;
  const invoiceId = await withTenant(db, ctx, async (tx) => createInvoice(tx, getStorage(), ctx, {
    projectId,
    supplierId: opt(formData, "supplierId"),
    invoiceNumber: opt(formData, "invoiceNumber"),
    invoiceDate: opt(formData, "invoiceDate"),
    photo: upload && upload.size > 0 ? {
      bytes: new Uint8Array(await upload.arrayBuffer()),
      fileName: upload.name, contentType: upload.type || "application/octet-stream",
    } : undefined,
  }));
  redirect(`/projects/${projectId}/budget/invoices/${invoiceId}`);
}

export async function updateInvoiceHeaderAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => updateInvoiceHeader(tx, ctx, invoiceId, {
    invoiceNumber: opt(formData, "invoiceNumber"),
    invoiceDate: opt(formData, "invoiceDate"),
    subtotalPaise: optPaise(formData, "subtotalInr"),
    taxPaise: optPaise(formData, "taxInr"),
    totalPaise: optPaise(formData, "totalInr"),
  }));
  revalidatePath(`/projects/${projectId}/budget/invoices/${invoiceId}`);
}

export async function addInvoiceLineAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => addManualInvoiceLine(tx, ctx, {
    invoiceId,
    description: str(formData, "description"),
    quantity: opt(formData, "quantity"),
    unit: opt(formData, "unit"),
    amountPaise: optPaise(formData, "amountInr"),
    costCodeId: opt(formData, "costCodeId"),
  }));
  revalidatePath(`/projects/${projectId}/budget/invoices/${invoiceId}`);
}

export async function editInvoiceLineAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => editInvoiceLine(tx, ctx, str(formData, "lineId"), {
    amountPaise: optPaise(formData, "amountInr"),
    costCodeId: opt(formData, "costCodeId"),
  }));
  revalidatePath(`/projects/${projectId}/budget/invoices/${invoiceId}`);
}

export async function deleteInvoiceLineAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => deleteInvoiceLine(tx, ctx, str(formData, "lineId")));
  revalidatePath(`/projects/${projectId}/budget/invoices/${invoiceId}`);
}

export async function markInvoiceReviewedAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => markInvoiceReviewed(tx, ctx, invoiceId));
  revalidatePath(`/projects/${projectId}/budget/invoices/${invoiceId}`);
}

export async function approveInvoiceAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const { db, ctx } = await projectCtx(projectId);
  await withTenant(db, ctx, (tx) => approveInvoice(tx, ctx, invoiceId));
  revalidatePath(`/projects/${projectId}/budget/invoices/${invoiceId}`);
  revalidatePath(`/projects/${projectId}/budget`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const { db, ctx } = await projectCtx(projectId);
  const amount = optPaise(formData, "amountInr");
  if (amount === null) throw new Error("Amount is required");
  await withTenant(db, ctx, (tx) => recordPayment(tx, ctx, {
    invoiceId, amountPaise: amount,
    paidDate: str(formData, "paidDate"),
    reference: opt(formData, "reference"),
  }));
  revalidatePath(`/projects/${projectId}/budget/invoices/${invoiceId}`);
  revalidatePath(`/projects/${projectId}/budget`);
}
