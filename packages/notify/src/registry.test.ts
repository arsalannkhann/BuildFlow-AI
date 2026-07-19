import { afterEach, expect, test } from "vitest";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNotifyRegistry } from "./registry";
import { emailOutboxDir, whatsappOutboxDir } from "./local-fs";

afterEach(() => {
  delete process.env.NOTIFY_EMAIL_PROVIDER;
  delete process.env.NOTIFY_WHATSAPP_PROVIDER;
  delete process.env.STORAGE_DIR;
});

test("provider selection defaults to local; unknown providers throw loudly", () => {
  const registry = getNotifyRegistry();
  expect(registry.email.provider).toBe("local");
  expect(registry.whatsapp.provider).toBe("local");

  process.env.NOTIFY_EMAIL_PROVIDER = "sendgrid";
  expect(() => getNotifyRegistry()).toThrow(/Unknown NOTIFY_EMAIL_PROVIDER: sendgrid/);
  delete process.env.NOTIFY_EMAIL_PROVIDER;

  process.env.NOTIFY_WHATSAPP_PROVIDER = "meta";
  expect(() => getNotifyRegistry()).toThrow(/Unknown NOTIFY_WHATSAPP_PROVIDER: meta/);
});

test("local adapters write .eml and .json files under the storage-root outbox", async () => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "bf-notify-"));
  const registry = getNotifyRegistry();

  const email = await registry.email.send({
    to: "manager@demo.buildflow.local", subject: "DPR 2026-07-19 is ready for review",
    text: "DPR 2026-07-19 is ready for review",
  });
  const emlFiles = readdirSync(emailOutboxDir());
  expect(emlFiles).toContain(`${email.providerMessageId}.eml`);
  const eml = readFileSync(join(emailOutboxDir(), `${email.providerMessageId}.eml`), "utf8");
  expect(eml).toContain("To: manager@demo.buildflow.local");
  expect(eml).toContain("Subject: DPR 2026-07-19 is ready for review");

  const wa = await registry.whatsapp.send({ to: "owner@demo.buildflow.local", text: "PO #4 awaits approval" });
  const waFiles = readdirSync(whatsappOutboxDir());
  expect(waFiles).toContain(`${wa.providerMessageId}.json`);
  const payload = JSON.parse(readFileSync(join(whatsappOutboxDir(), `${wa.providerMessageId}.json`), "utf8"));
  expect(payload.to).toBe("owner@demo.buildflow.local");
  expect(payload.text).toBe("PO #4 awaits approval");
});
