"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function AuthControls() {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  useEffect(() => {
    if (!client) {
      setReady(true);
      return;
    }

    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (active) {
        setEmail(data.user?.email ?? null);
        setReady(true);
      }
    }).catch(() => {
      if (active) setReady(true);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setEmail(session?.user.email ?? null);
        setReady(true);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  async function signOut() {
    if (!client || signOutBusy) return;
    setSignOutBusy(true);
    const { error } = await client.auth.signOut();
    setSignOutBusy(false);
    if (error) return;
    setEmail(null);
    window.location.assign("/");
  }

  if (!ready) return <div className="auth-controls auth-controls-muted" aria-label="Checking account">Checking account…</div>;
  if (!client) return <Link className="auth-controls auth-local-mode" href="/login">Local-only mode · Configure sign-in</Link>;
  if (!email) return <Link className="auth-controls auth-sign-in" href="/login">Sign in</Link>;

  return (
    <div className="auth-controls auth-signed-in">
      <span className="auth-user-email" title={email}>{email}</span>
      <button type="button" onClick={() => { void signOut(); }} disabled={signOutBusy}>
        {signOutBusy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
