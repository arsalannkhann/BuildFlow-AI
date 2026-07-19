"use client";

// Shown exactly once after generating a member password-reset link (only the token hash is
// stored, so the link cannot be reconstructed later). Mirrors InviteLinkNotice.
export function ResetLinkNotice({ token }: { token: string }) {
  const url = typeof window === "undefined"
    ? `/reset/${token}`
    : `${window.location.origin}/reset/${token}`;
  return (
    <section className="surface-card admin-section admin-invite-notice" aria-live="polite">
      <h2>Password reset link created</h2>
      <p>
        Hand this link to the member now — it is shown only once, works once, and expires in
        30 minutes. Setting a new password signs out all of their devices.
      </p>
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
