import { renderBrandedEmail } from "../src/template";
const html = renderBrandedEmail({
  previewText: "BuildFlow email delivery is live from bronn.dev.",
  title: "Email delivery is configured",
  body: "This is a live test of BuildFlow's branded transactional email, sent from the verified bronn.dev domain through Resend. Password resets and notifications now arrive in this format.",
  ctaUrl: "https://buildflow-web-966295223036.asia-south1.run.app/login",
  ctaLabel: "Open BuildFlow",
  validityNote: "No action is required — this is a delivery test triggered during setup.",
});
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({
    from: "BuildFlow <no-reply@bronn.dev>",
    to: ["arsalan.khan@dentistryautomation.com"],
    subject: "BuildFlow delivery test — bronn.dev is live",
    text: "BuildFlow branded email delivery test from bronn.dev via Resend. No action required.",
    html,
  }),
});
console.log("status:", res.status, await res.text());
