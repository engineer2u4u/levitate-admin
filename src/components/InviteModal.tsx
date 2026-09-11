"use client";

import { useState } from "react";
import { ROLE_BLURB, ROLE_LABEL, sendInvite, type PortalRole } from "@/lib/users";
import { LANDING, adminUrl } from "@/lib/supabase";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const ROLES: PortalRole[] = ["viewer", "admin"];

export default function InviteModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<PortalRole>("viewer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await sendInvite({ email, name, role });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      // A saved invite with a failed email is still an invite: refresh the
      // list behind the modal so Resend is available.
      onSent();
      return;
    }
    toast(`Invite sent to ${email.trim().toLowerCase()}`);
    onSent();
    onClose();
  };

  return (
    <Modal
      title="Invite someone"
      sub="They get an email with a link. Opening it signs them in and gives them the role you pick here."
      onClose={onClose}
      width={480}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="name@levitatepeoplesoft.com" style={input} autoFocus />
        </Field>

        <Field label="Name" hint="Optional — shown in the list until they set their own.">
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Parichita Kotnala" style={input} />
        </Field>

        <div>
          <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
            Role
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ROLES.map((r) => {
              const on = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={on}
                  style={{ textAlign: "left", cursor: "pointer", background: on ? "#f2fbfa" : "#fff", border: `1px solid ${on ? "var(--teal)" : "var(--line)"}`, borderRadius: 10, padding: "11px 13px" }}
                >
                  <div style={{ font: "700 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{ROLE_LABEL[r]}</div>
                  <div style={{ font: "500 11px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{ROLE_BLURB[r]}</div>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div role="alert" style={{ font: "600 11.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "10px 12px" }}>
            {error}
          </div>
        )}

        {/* Supabase silently falls back to the project's Site URL — the
            learner app — when this address is not in its Redirect URLs
            allow-list. Showing it here makes that misconfiguration visible
            before an invite goes out, rather than when someone lands on the
            wrong site. */}
        <div style={{ font: "500 10.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: 9, padding: "9px 11px" }}>
          Their link returns to <strong style={{ color: "var(--body)" }}>{adminUrl(LANDING)}</strong>. If they land on the
          public site instead, add this address to <strong style={{ color: "var(--body)" }}>Redirect URLs</strong> in Supabase
          (Authentication → URL Configuration).
        </div>

        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
        </ModalActions>
      </form>
    </Modal>
  );
}
