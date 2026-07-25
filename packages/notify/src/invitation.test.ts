import { expect, test, vi } from "vitest";
import { buildInvitationEmail, sendInvitationEmail } from "./invitation";
import type { EmailPort } from "./ports";

const input = {
  to: "Engineer@Example.com ",
  inviteUrl: "https://buildflow.example/invite/org-scoped-token",
  organizationName: "Northstar <Infra>",
  projectName: "Tower A",
  role: "site_engineer",
  expiresAt: new Date("2026-08-02T12:00:00.000Z"),
};

test("invitation email names the organization and carries the exact scoped join URL", () => {
  const message = buildInvitationEmail(input);

  expect(message.to).toBe("engineer@example.com");
  expect(message.subject).toBe("Join Northstar <Infra> on BuildFlow");
  expect(message.text).toContain("Tower A project in Northstar <Infra>");
  expect(message.text).toContain("as site engineer");
  expect(message.text).toContain(input.inviteUrl);
  expect(message.text).toContain("works once");
  expect(message.html).toContain("Join organization");
  expect(message.html).toContain(input.inviteUrl);
  expect(message.html).toContain("Northstar &lt;Infra&gt;");
  expect(message.html).not.toContain("Northstar <Infra>");
});

test("invitation email uses the configured port", async () => {
  const send = vi.fn().mockResolvedValue({ providerMessageId: "email-123" });
  const email: EmailPort = { provider: "test", send };

  await expect(sendInvitationEmail(input, email)).resolves.toEqual({
    providerMessageId: "email-123",
  });
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0][0]).toMatchObject({
    to: "engineer@example.com",
    subject: "Join Northstar <Infra> on BuildFlow",
  });
});
