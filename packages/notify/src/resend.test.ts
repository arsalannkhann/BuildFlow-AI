import { expect, test } from "vitest";
import { ResendEmail } from "./resend";

test("resend adapter posts the message with auth and returns the provider id", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  }) as typeof fetch;

  const adapter = new ResendEmail({ apiKey: "re_test", from: "BuildFlow <x@test>", fetchFn });
  const result = await adapter.send({ to: "a@b.c", subject: "Reset", text: "link" });

  expect(result.providerMessageId).toBe("email_123");
  expect(calls[0].url).toBe("https://api.resend.com/emails");
  expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
  const body = JSON.parse(String(calls[0].init.body));
  expect(body).toMatchObject({ from: "BuildFlow <x@test>", to: ["a@b.c"], subject: "Reset" });
});

test("non-2xx surfaces a key-free, content-free error for the retry loop", async () => {
  const fetchFn = (async () => new Response("nope", { status: 422 })) as typeof fetch;
  const adapter = new ResendEmail({ apiKey: "re_test", fetchFn });
  await expect(adapter.send({ to: "a@b.c", subject: "s", text: "t" }))
    .rejects.toThrow(/status 422/);
});

test("missing key fails fast at construction", () => {
  delete process.env.RESEND_API_KEY;
  expect(() => new ResendEmail()).toThrow(/RESEND_API_KEY/);
});

test("html part is forwarded when provided and escaped by the renderer", async () => {
  const calls: { init: RequestInit }[] = [];
  const fetchFn = (async (_u: unknown, init: unknown) => {
    calls.push({ init: init as RequestInit });
    return new Response(JSON.stringify({ id: "e" }), { status: 200 });
  }) as typeof fetch;
  const { renderBrandedEmail } = await import("./template");
  const html = renderBrandedEmail({
    previewText: "p", title: "<script>alert(1)</script>", body: "b",
    ctaUrl: "https://x.test/r/1", ctaLabel: "Go", validityNote: "v",
  });
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  const adapter = new (await import("./resend")).ResendEmail({ apiKey: "k", fetchFn });
  await adapter.send({ to: "a@b.c", subject: "s", text: "t", html });
  const body = JSON.parse(String(calls[0].init.body));
  expect(body.html).toContain("BuildFlow");
});
