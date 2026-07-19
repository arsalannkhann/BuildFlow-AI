"use client";
import { useActionState } from "react";
import { registerOrganizationFormAction, type SignupFormState } from "@/app/actions/auth";

const INITIAL: SignupFormState = { error: null, organizationName: "", ownerName: "", email: "" };

const MESSAGES: Record<string, string> = {
  limited: "Too many attempts. Wait before trying again.",
  conflict: "An account already exists for that email. Sign in instead, or use the password reset.",
  org_name: "Organization name must be between 2 and 120 characters.",
  owner_name: "Please enter your name (2–100 characters).",
  email: "That email address doesn't look valid. Check it and try again.",
  password: "Password must be at least 12 characters. A short sentence works well.",
  invalid: "Check the details and try again.",
};

export function SignupForm({ initialError }: { initialError: string | null }) {
  const [state, formAction, pending] = useActionState(registerOrganizationFormAction, {
    ...INITIAL, error: initialError,
  });
  const fieldError = (code: string) => state.error === code;

  return (
    <>
      {state.error ? (
        <p role="alert" className="login-error">{MESSAGES[state.error] ?? MESSAGES.invalid}</p>
      ) : null}
      <form action={formAction} className="login-email-form">
        <label>
          Organization name
          <input name="organizationName" required minLength={2} maxLength={120}
            autoComplete="organization" defaultValue={state.organizationName}
            aria-invalid={fieldError("org_name") || undefined} />
        </label>
        <label>
          Your name
          <input name="ownerName" required minLength={2} maxLength={100}
            autoComplete="name" defaultValue={state.ownerName}
            aria-invalid={fieldError("owner_name") || undefined} />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="username"
            defaultValue={state.email}
            aria-invalid={fieldError("email") || fieldError("conflict") || undefined} />
        </label>
        <label>
          Password <small>(at least 12 characters — a short sentence works well)</small>
          <input name="password" type="password" required minLength={12}
            autoComplete="new-password"
            aria-invalid={fieldError("password") || undefined} />
        </label>
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Creating workspace…" : "Create organization"}
        </button>
      </form>
    </>
  );
}
