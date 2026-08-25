"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { canWrite, currentUser, hasAccess, needsPassword, onAuthChange, setPassword, signIn, signOut, type AdminUser } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import { Field, PasswordInput, input } from "./ui";

type Ctx = { user: AdminUser | null; canWrite: boolean; signOut: () => Promise<void> };
const AuthCtx = createContext<Ctx>({ user: null, canWrite: false, signOut: async () => {} });
export const useAdminUser = () => useContext(AuthCtx);

/** True when the signed-in account may change things. Viewers get `false`. */
export const useCanWrite = () => useContext(AuthCtx).canWrite;

/**
 * The one thing an invited person does before the portal opens.
 *
 * Their invite link is single-use, so an account that never picks a password
 * has no way back in — which is why this blocks rather than nudges. Sign out is
 * the only way past it, and that leaves them exactly where they started.
 */
function FirstPassword({ email, onDone, onSignOut }: { email: string; onDone: () => void; onSignOut: () => void }) {
  const [value, setValue] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (value.length < 8) return setError("Use at least 8 characters.");
    if (value !== again) return setError("The two passwords do not match.");
    setBusy(true);
    setError("");
    const res = await setPassword(value);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Could not set the password.");
    onDone();
  };

  return (
    <Shell>
      <div style={{ font: "700 21px/1.3 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginBottom: 6 }}>
        Choose a password
      </div>
      <p style={{ font: "500 12.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", margin: "0 0 20px" }}>
        Your invite is accepted and <strong style={{ color: "var(--ink)" }}>{email}</strong> now has access. The link you
        followed only works once, so set a password before continuing — it is how you sign in from here on.
      </p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Field label="New password">
          <PasswordInput value={value} onChange={setValue} autoComplete="new-password" placeholder="Minimum 8 characters" autoFocus />
        </Field>
        <Field label="Confirm">
          <PasswordInput value={again} onChange={setAgain} autoComplete="new-password" placeholder="Type it again" />
        </Field>

        {error && <div role="alert" style={errorStyle}>{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 4, padding: "13px 18px", font: "700 13px 'Plus Jakarta Sans',sans-serif" }}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
        <button type="button" onClick={onSignOut} style={{ cursor: "pointer", border: "none", background: "none", font: "700 11px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", padding: "2px 0" }}>
          Sign out instead
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 16, padding: "30px 30px 26px", boxShadow: "0 26px 70px rgba(4,16,30,.4)" }}>
        <div style={{ font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)", letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 9 }}>
          Levitate LMS
        </div>
        {children}
      </div>
    </div>
  );
}

const errorStyle ={ font: "600 11.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "10px 12px" } as const;

/**
 * Nothing in the admin renders until an invited account is present.
 *
 * There is deliberately no sign-up here: accounts exist because an admin
 * invited them from Users, and the role rides on the invite. This gate is a
 * convenience, not the security boundary — Row Level Security refuses reads to
 * strangers and writes to viewers regardless of what the UI shows.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Resolve the session once on mount, then again whenever it changes. An
  // invite link lands here with the session in the URL, so the change event is
  // what signs the new person in.
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void currentUser().then((u) => {
        if (!alive) return;
        setUser(u);
        setLoading(false);
      });
    };
    refresh();
    const unsub = onAuthChange(refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const doSignOut = useCallback(async () => {
    await signOut();
    setUser(null);
  }, []);

  if (!supabaseConfigured) {
    return (
      <Shell>
        <div style={{ font: "700 19px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginBottom: 8 }}>Not configured</div>
        <p style={{ font: "400 13px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", margin: 0 }}>
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart.
        </p>
      </Shell>
    );
  }

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "var(--navy)" }} />;
  }

  /* signed in, but never invited to this portal */
  if (user && !hasAccess(user)) {
    return (
      <Shell>
        <div style={{ font: "700 19px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginBottom: 8 }}>No access to the portal</div>
        <p style={{ font: "400 13px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", margin: "0 0 18px" }}>
          <strong style={{ color: "var(--ink)" }}>{user.email}</strong> is signed in, but has not been given access. Access is by
          invitation — ask an admin to invite this address from the Users screen, then follow the link they send.
        </p>
        <button type="button" className="btn btn-ghost" style={{ width: "100%" }} onClick={() => void doSignOut()}>
          Sign in as someone else
        </button>
      </Shell>
    );
  }

  /* invited, arrived through the link, no password yet */
  if (user && needsPassword(user)) {
    return (
      <FirstPassword
        email={user.email}
        onDone={() => void currentUser().then(setUser)}
        onSignOut={() => void doSignOut()}
      />
    );
  }

  /* signed in and invited */
  if (user) {
    return <AuthCtx.Provider value={{ user, canWrite: canWrite(user), signOut: doSignOut }}>{children}</AuthCtx.Provider>;
  }

  /* signed out */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await signIn(email, password);
    setBusy(false);
    if (res.ok) setUser(res.user);
    else setError(res.error);
  };

  return (
    <Shell>
      <div style={{ font: "700 21px/1.3 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginBottom: 6 }}>
        Sign in to LMS Admin
      </div>
      <p style={{ font: "500 12.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", margin: "0 0 20px" }}>
        Access is by invitation. If you were invited, open the link in your email first — it signs you in and sets up your
        account, and you can pick a password from Users once you are inside.
      </p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@levitatepeoplesoft.com" style={input} />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" placeholder="Your password" />
        </Field>

        {error && <div role="alert" style={errorStyle}>{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 4, padding: "13px 18px", font: "700 13px 'Plus Jakarta Sans',sans-serif" }}>
          {busy ? "Please wait…" : "Sign in"}
        </button>
      </form>
    </Shell>
  );
}
