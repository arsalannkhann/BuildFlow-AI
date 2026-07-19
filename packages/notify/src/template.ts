// Branded transactional email shell (see templates/buildflow-email.html for the standalone
// upload version). Rendered app-side at send time; every interpolated value is escaped —
// notification titles/bodies are operational strings, but escaping is non-negotiable.

const esc = (v: string): string =>
  v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export type BrandedEmailInput = {
  previewText: string;
  title: string;
  body: string;
  ctaUrl: string;
  ctaLabel: string;
  validityNote: string;
  orgName?: string;
};

export function renderBrandedEmail(input: BrandedEmailInput): string {
  const org = input.orgName ? ` for ${esc(input.orgName)}` : "";
  const url = esc(input.ctaUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BuildFlow</title></head>
<body style="margin:0; padding:0; background-color:#F3F4F6;">
<div style="display:none; max-height:0; overflow:hidden;">${esc(input.previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6; border-collapse:collapse;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; border-collapse:collapse;">
<tr><td style="background-color:#102A43; border-radius:14px 14px 0 0; padding:24px 32px; font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:inline-block; vertical-align:middle; width:10px; height:22px; background-color:#A84812; border-radius:3px;">&nbsp;</span>
<span style="display:inline-block; vertical-align:middle; width:10px; height:14px; background-color:#DCEAF2; border-radius:3px; margin-left:3px;">&nbsp;</span>
<span style="font-size:20px; font-weight:700; color:#FFFFFF; margin-left:10px; vertical-align:middle;">BuildFlow</span>
<span style="font-size:12px; color:#9FB3C8; margin-left:8px; vertical-align:middle;">Site reports, simplified</span>
</td></tr>
<tr><td style="background-color:#FFFFFF; border:1px solid #E5E7EB; border-top:0; border-radius:0 0 14px 14px; padding:32px; font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="font-size:22px; line-height:30px; font-weight:700; color:#111827; padding-bottom:12px;">${esc(input.title)}</div>
<div style="font-size:16px; line-height:25px; color:#374151; padding-bottom:28px;">${esc(input.body)}</div>
<div style="padding-bottom:28px;">
<a href="${url}" style="display:inline-block; background-color:#A84812; color:#FFFFFF; font-size:16px; font-weight:700; line-height:48px; padding:0 32px; border-radius:10px; text-decoration:none;">${esc(input.ctaLabel)}</a>
</div>
<div style="font-size:13px; line-height:20px; color:#4B5563; border-top:1px solid #E5E7EB; padding-top:20px;">
If the button doesn't work, copy this link into your browser:<br>
<a href="${url}" style="color:#1F4E6D; word-break:break-all;">${url}</a><br><br>
${esc(input.validityNote)}
</div>
</td></tr>
<tr><td style="font-size:12px; line-height:18px; color:#6B7280; text-align:center; padding:20px 24px 0; font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
Sent by BuildFlow${org}.<br>If you didn't request this, you can safely ignore this email.
</td></tr>
</table></td></tr></table></body></html>`;
}
