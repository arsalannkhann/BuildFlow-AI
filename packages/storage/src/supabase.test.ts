import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseStorage } from "./supabase";

describe("SupabaseStorage", () => {
  test("uses private signed links with bounded download lifetime", async () => {
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://storage.test/signed" }, error: null }));
    const createSignedUploadUrl = vi.fn(async () => ({ data: { signedUrl: "https://storage.test/upload", token: "opaque" }, error: null }));
    const client = {
      storage: { from: vi.fn(() => ({ createSignedUrl, createSignedUploadUrl })) },
    } as unknown as SupabaseClient;
    const storage = new SupabaseStorage("private", "https://example.supabase.co", "service-role", client);

    const download = await storage.createSignedGetUrl("org/report.pdf", 99_999);
    const upload = await storage.createSignedUploadUrl("org/photo.jpg");

    expect(createSignedUrl).toHaveBeenCalledWith("org/report.pdf", 3_600, { download: false });
    expect(download.url).toContain("signed");
    expect(upload.token).toBe("opaque");
    expect(createSignedUploadUrl).toHaveBeenCalledWith("org/photo.jpg", { upsert: false });
  });
});
