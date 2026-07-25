import { getNotifyRegistry } from "./registry";
import { renderBrandedEmail } from "./template";
import type { EmailMessage, EmailPort } from "./ports";

export type InvitationEmailInput = {
  to: string;
  inviteUrl: string;
  organizationName: string;
  projectName?: string | null;
  role: string;
  expiresAt: Date;
};

const oneLine = (value: string): string => value.replaceAll(/[\r\n]+/g, " ").trim();

export function buildInvitationEmail(input: InvitationEmailInput): EmailMessage {
  const organizationName = oneLine(input.organizationName);
  const projectName = input.projectName ? oneLine(input.projectName) : null;
  const role = oneLine(input.role).replaceAll("_", " ");
  const scope = projectName
    ? `the ${projectName} project in ${organizationName}`
    : organizationName;
  const expiry = input.expiresAt.toUTCString();
  const body = `You have been invited to join ${scope} as ${role}.`;

  return {
    to: input.to.trim().toLowerCase(),
    subject: `Join ${organizationName} on BuildFlow`,
    text: [
      body,
      "",
      `Accept this organization-scoped invitation: ${input.inviteUrl}`,
      "",
      `This link works once and expires on ${expiry}.`,
      "If you were not expecting this invitation, you can safely ignore this email.",
    ].join("\n"),
    html: renderBrandedEmail({
      previewText: `Join ${organizationName} on BuildFlow.`,
      title: `You’re invited to ${organizationName}`,
      body,
      ctaUrl: input.inviteUrl,
      ctaLabel: "Join organization",
      validityNote: `This organization-scoped link works once and expires on ${expiry}. If you were not expecting this invitation, you can safely ignore this email.`,
      orgName: organizationName,
    }),
  };
}

export async function sendInvitationEmail(
  input: InvitationEmailInput,
  email: EmailPort = getNotifyRegistry().email,
): Promise<{ providerMessageId: string }> {
  return email.send(buildInvitationEmail(input));
}
