import { describe, expect, test, vi } from "vitest";
import { Storage } from "@google-cloud/storage";
import { GcsStorage } from "./gcs";

describe("GcsStorage", () => {
  test("keeps objects private and generates bounded V4 signed links", async () => {
    const getSignedUrl = vi.fn(async (options: { version: string; action: string; expires: Date }) => [
      `https://storage.googleapis.test/${options.action}`,
    ]);
    const file = vi.fn(() => ({ getSignedUrl }));
    const client = { bucket: vi.fn(() => ({ file })) } as unknown as Storage;
    const storage = new GcsStorage("private-evidence", client);

    const download = await storage.createSignedGetUrl("org/report.pdf", 99_999);
    const upload = await storage.createSignedUploadUrl("org/photo.jpg");

    expect(getSignedUrl).toHaveBeenNthCalledWith(1, expect.objectContaining({ version: "v4", action: "read" }));
    expect(getSignedUrl).toHaveBeenNthCalledWith(2, expect.objectContaining({ version: "v4", action: "write" }));
    expect(download.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);
    expect(upload.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(900_000);
  });

  test("rejects traversal keys before calling GCS", async () => {
    const client = { bucket: vi.fn(() => ({ file: vi.fn() })) } as unknown as Storage;
    const storage = new GcsStorage("private-evidence", client);
    await expect(storage.get("org/../other/file")).rejects.toThrow("Invalid storage key");
  });
});
