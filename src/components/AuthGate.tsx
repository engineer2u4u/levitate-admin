"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { currentUser, onAuthChange, signIn, signOut, signUp, type AdminUser } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import { Field, input } from "./ui";

type Ctx = { user: AdminUser | null; signOut: () => Promise<void> };
const AuthCtx = createContext<Ctx>({ user: null, signOut: async () => {} });
export const useAdminUser = () => useContext(AuthCtx);

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

/**
 * Nothing in the admin renders until an authenticated *admin* is present.
 *
 * This gate is a convenience, not the security boundary — Row Level Security
 * refuses non-admin writes at the database regardless of what the UI shows.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Resolve the session once on mount, then again whenever it changes. The
  // state write lives inside the promise callback, so nothing is set during
  // the effect itself.
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

  /* signed in, but not an admin */
  if (user && user.role !== "admin") {
    return (
      <Shell>
        <div style={{ font: "700 19px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginBottom: 8 }}>Not an admin account</div>
        <p style={{ font: "400 13px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", margin: "0 0 18px" }}>
          <strong style={{ color: "var(--ink)" }}>{user.email}</strong> is signed in but does not have the admin role, so the catalogue is
          not available. Ask an existing admin to grant it.
        </p>
        <button type="button" className="btn btn-ghost" style={{ width: "100%" }} onClick={() => void doSignOut()}>
          Sign in as someone else
        </button>
      </Shell>
    );
  }

  /* signed in as an admin */
  if (user) {
    return <AuthCtx.Provider value={{ user, signOut: doSignOut }}>{children}</AuthCtx.Provider>;
  }

  /* signed out */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const res = mode === "signup" ? await signUp(name, email, password) : await signIn(email, password);
    setBusy(false);
    if (res.ok) {
      setUser(res.user);
    } else if (mode === "signup" && res.error.startsWith("Account created")) {
      setNotice(res.error);
      setMode("signin");
    } else {
      setError(res.error);
    }
  };

  return (
    <Shell>
      <div style={{ font: "700 21px/1.3 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginBottom: 6 }}>
        {mode === "signup" ? "Create an admin account" : "Sign in to LMS Admin"}
      </div>
      <p style={{ font: "500 12.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", margin: "0 0 20px" }}>
        {mode === "signup"
          ? "New accounts start without admin rights — an existing admin grants them."
          : "Manage courses, sessions and enrolments."}
      </p>

      <div style={{ display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: 999, padding: 5, marginBottom: 18 }}>
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(""); setNotice(""); }}
            style={{ flex: 1, cursor: "pointer", border: "none", borderRadius: 999, padding: "9px 12px", font: "700 12px 'Plus Jakarta Sans',sans-serif", color: mode === m ? "#fff" : "var(--muted)", background: mode === m ? "var(--grad)" : "transparent" }}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {mode === "signup" && (
          <Field label="Full name">
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Parichita Kotnala" style={input} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@levitatepeoplesoft.com" style={input} />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "Minimum 8 characters" : "Your password"}
            style={input}
          />
        </Field>

        {notice && (
          <div role="status" style={{ font: "600 11.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "#136f6a", background: "#eafaf8", border: "1px solid #b9ece7", borderRadius: 9, padding: "10px 12px" }}>{notice}</div>
        )}
        {error && (
          <div role="alert" style={{ font: "600 11.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "10px 12px" }}>{error}</div>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 4, padding: "13px 18px", font: "700 13px 'Plus Jakarta Sans',sans-serif" }}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
    </Shell>
  );
}
