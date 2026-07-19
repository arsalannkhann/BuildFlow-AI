import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { newId } from "@buildflow/domain/ids";
import type { EmailMessage, EmailPort, WhatsAppMessage, WhatsAppPort } from "./ports";
import { workspaceRoot } from "./workspace-root";

// Local-FS adapters: development/default transport that writes each message as a file
// under the storage root's outbox directory instead of calling a real provider.
//   email    -> <storage root>/outbox/email/<id>.eml      (RFC 5322-ish plain text)
//   whatsapp -> <storage root>/outbox/whatsapp/<id>.json  (mock of a provider payload)
// Same root-resolution rule as @buildflow/storage local-fs: STORAGE_DIR (absolute or
// workspace-root-relative), default "local-storage".

const storageRoot = () => {
  const configured = process.env.STORAGE_DIR ?? "local-storage";
  return isAbsolute(configured) ? configured : join(workspaceRoot(), configured);
};

export const emailOutboxDir = () => join(storageRoot(), "outbox", "email");
export const whatsappOutboxDir = () => join(storageRoot(), "outbox", "whatsapp");

export class LocalFsEmail implements EmailPort {
  readonly provider = "local";

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    const id = newId();
    const dir = emailOutboxDir();
    await mkdir(dir, { recursive: true });
    const eml = [
      `Message-ID: <${id}@buildflow.local>`,
      `Date: ${new Date().toUTCString()}`,
      `From: BuildFlow <no-reply@buildflow.local>`,
      `To: ${message.to}`,
      `Subject: ${message.subject.replaceAll(/[\r\n]/g, " ")}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      message.text,
      ``,
    ].join("\r\n");
    await writeFile(join(dir, `${id}.eml`), eml, "utf8");
    return { providerMessageId: id };
  }
}

export class LocalFsWhatsApp implements WhatsAppPort {
  readonly provider = "local";

  async send(message: WhatsAppMessage): Promise<{ providerMessageId: string }> {
    const id = newId();
    const dir = whatsappOutboxDir();
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${id}.json`),
      JSON.stringify({ id, to: message.to, text: message.text, sentAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
    return { providerMessageId: id };
  }
}
