import type { EmailMessage, EmailPort } from "./ports";

// Resend transport (https://resend.com). The API key stays server-side in
// RESEND_API_KEY (Secret Manager in production); EMAIL_FROM must be a sender the
// Resend account is allowed to use — before a domain is verified that is
// "BuildFlow <onboarding@resend.dev>", which only delivers to the account owner.
export class ResendEmail implements EmailPort {
  readonly provider = "resend";
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts?: { apiKey?: string; from?: string; fetchFn?: typeof fetch }) {
    const apiKey = opts?.apiKey ?? process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is required when NOTIFY_EMAIL_PROVIDER=resend");
    this.apiKey = apiKey;
    this.from = opts?.from ?? process.env.EMAIL_FROM ?? "BuildFlow <onboarding@resend.dev>";
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    const response = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // Delivery jobs retry with backoff; keep the message key-free and content-free.
      throw new Error(`Resend send failed with status ${response.status}`);
    }
    const parsed = (await response.json().catch(() => ({}))) as { id?: string };
    return { providerMessageId: parsed.id ?? "resend-unknown" };
  }
}
