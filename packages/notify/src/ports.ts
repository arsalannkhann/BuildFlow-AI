// Outbound notification channels (Phase E1). Message content is ALWAYS operational —
// titles and record references only, never report narrative, transcripts, or customer
// content (rules.md §14). Enforced upstream in the emit path; adapters just transport.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailPort {
  readonly provider: string;
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

export type WhatsAppMessage = {
  to: string;
  text: string;
};

export interface WhatsAppPort {
  readonly provider: string;
  send(message: WhatsAppMessage): Promise<{ providerMessageId: string }>;
}

export type NotifyRegistry = {
  email: EmailPort;
  whatsapp: WhatsAppPort;
};
