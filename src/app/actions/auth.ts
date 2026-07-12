"use server";
import { redirect } from "next/navigation";
import { loginAs } from "@/app/session";
import { ensureBooted } from "@/db/boot";

export async function loginAction(formData: FormData): Promise<void> {
  await ensureBooted();
  await loginAs(String(formData.get("userId")));
  redirect("/reports");
}
