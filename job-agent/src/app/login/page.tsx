"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setMessage("");
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    const { error: authError } = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: window.location.origin + "/auth/callback?next=/"
      }
    });

    setBusy(false);
    if (authError) {
      setError("The sign-in link could not be sent. Check the Supabase Auth email settings and try again.");
      return;
    }
    setMessage("If this address is allowed by the authentication project, a sign-in link will arrive by email. Open it in this browser to continue.");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-back-link" href="/">← Back to Job Agent</Link>
        <p className="auth-eyebrow">SECURE ACCOUNT ACCESS</p>
        <h1>Sign in to Job Agent</h1>
        <p className="auth-description">Use a one-time email link. No password is stored by this application.</p>
        {!client ? (
          <div className="auth-config-notice" role="status">
            <strong>Authentication is not configured yet.</strong>
            <p>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the deployment environment, then configure the allowed redirect URL in Supabase Auth. The dashboard remains in local-only demo mode until then.</p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={sendMagicLink}>
            <label htmlFor="auth-email">Email address</label>
            <input id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
            <button type="submit" disabled={busy || !email.trim()}>{busy ? "Sending secure link…" : "Email me a sign-in link"}</button>
            <p className="auth-privacy-note">The link expires according to your Supabase Auth settings. Never share it with anyone.</p>
          </form>
        )}
        {message && <p className="auth-success" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
