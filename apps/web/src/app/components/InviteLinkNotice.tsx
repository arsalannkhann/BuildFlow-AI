"use client";

// Shown exactly once after creating an invitation (the token is stored only as a hash, so
// the link cannot be reconstructed later). Email/WhatsApp delivery replaces this in Phase E.
export function InviteLinkNotice({ token }: { token: string }) {
  const url = typeof window === "undefined"
    ? `/invite/${token}`
    : `${window.location.origin}/invite/${token}`;
  return (
    <section className="surface-card admin-section admin-invite-notice" aria-live="polite">
      <h2>Invitation created</h2>
      <p>Share this link with the invitee now — it is shown only once and expires in 7 days:</p>
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
