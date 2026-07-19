import { LocalFsEmail, LocalFsWhatsApp } from "./local-fs";
import type { NotifyRegistry } from "./ports";

// Provider selection mirrors AI_PROVIDER handling (rules.md §15): "local" is always
// available; a typo must never silently downgrade production to the local outbox.
// Real SMTP / Meta Cloud API adapters slot in here later behind new provider names.
export function getNotifyRegistry(): NotifyRegistry {
  const email = process.env.NOTIFY_EMAIL_PROVIDER ?? "local";
  const whatsapp = process.env.NOTIFY_WHATSAPP_PROVIDER ?? "local";
  if (email !== "local") {
    throw new Error(`Unknown NOTIFY_EMAIL_PROVIDER: ${email} (expected "local")`);
  }
  if (whatsapp !== "local") {
    throw new Error(`Unknown NOTIFY_WHATSAPP_PROVIDER: ${whatsapp} (expected "local")`);
  }
  return { email: new LocalFsEmail(), whatsapp: new LocalFsWhatsApp() };
}
