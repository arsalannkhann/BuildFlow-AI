"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { markAllRead, markRead, setMyPreference } from "@/core/notifications-core";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await markRead(db, ctx, str(formData, "notificationId"));
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  await markAllRead(db, ctx);
  revalidatePath("/notifications");
}

export async function savePreferencesAction(formData: FormData): Promise<void> {
  const db = await getDb();
  const ctx = await currentContext();
  // The matrix posts every cell: "<eventKind>::<channel>" checkboxes plus a hidden list
  // of all cells so unchecked boxes are explicit (HTML forms omit unchecked inputs).
  const cells = String(formData.get("cells") ?? "").split(",").filter(Boolean);
  for (const cell of cells) {
    const [eventKind, channel] = cell.split("::");
    if (!eventKind || !channel) continue;
    await setMyPreference(db, ctx, {
      eventKind, channel, enabled: formData.get(`pref:${cell}`) === "on",
    });
  }
  revalidatePath("/account");
}
