"use client";

// Shown exactly once after creating an invitation (the token is stored only as a hash, so
// the link cannot be reconstructed later). It remains as a recovery path for email delivery.
export type InvitationDelivery = "sent" | "failed" | "not-requested";

export function InviteLinkNotice({
  token, delivery = "not-requested",
}: {
  token: string;
  delivery?: InvitationDelivery;
}) {
  const url = typeof window === "undefined"
    ? `/invite/${token}`
    : `${window.location.origin}/invite/${token}`;
  const failed = delivery === "failed";
  return (
    <section
      className={`surface-card admin-section admin-invite-notice${failed ? " admin-invite-notice--warning" : ""}`}
      aria-live="polite"
    >
      <h2>Invitation created</h2>
      {delivery === "sent"
        ? <p>The secure join link was emailed automatically. This fallback is shown only once and expires in 7 days:</p>
        : failed
          ? <p>The invitation is valid, but the email could not be sent. Share this link manually; it is shown only once and expires in 7 days:</p>
          : <p>Share this link with the invitee now — it is shown only once and expires in 7 days:</p>}
      <code className="admin-invite-notice__link">{url}</code>
      <button
        type="button"
        className="secondary-button"
        onClick={() => { void navigator.clipboard.writeText(url); }}
      >
        Copy link
      </button>
    </section>
  );
}
