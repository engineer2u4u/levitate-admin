"use client";

import { useCallback, useEffect, useState } from "react";
import { setPassword } from "@/lib/auth";
import {
  ROLE_LABEL,
  cancelInvite,
  changeRole,
  listInvites,
  listUsers,
  resendInvite,
  revokeAccess,
  type AccessUser,
  type Invite,
  type PortalRole,
} from "@/lib/users";
import { initials } from "@/lib/format";
import { EmptyState, Field, Modal, ModalActions, PasswordInput, Pill, card, th } from "./ui";
import InviteModal from "./InviteModal";
import { useAdminUser, useCanWrite } from "./AuthGate";
import { useToast } from "./AdminShell";

const GRID = "2fr 1fr 1fr 1.3fr";
const INVITE_GRID = "2fr 1fr 1fr 1.3fr";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function UsersView() {
  const { user } = useAdminUser();
  const isAdmin = useCanWrite();
  const toast = useToast();

  const [users, setUsers] = useState<AccessUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Bumping the key is what triggers a reload; the state writes happen inside
  // the promise callback rather than in the effect body.
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    void Promise.all([listUsers(), listInvites()]).then(([u, i]) => {
      if (!alive) return;
      setUsers(u);
      setInvites(i);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Every action runs the same way: do it, say what happened, reload. The list
  // is small enough that re-reading it beats patching state and hoping the two
  // agree.
  const run = async (id: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setBusyId(id);
    const res = await action();
    setBusyId(null);
    toast(res.ok ? done : res.error);
    refresh();
  };

  const admins = users.filter((u) => u.role === "admin").length;

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
          {users.length} with access · {admins} admin{admins === 1 ? "" : "s"}
          {invites.length > 0 ? ` · ${invites.length} invite${invites.length === 1 ? "" : "s"} pending` : ""}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setPasswordOpen(true)}>Set my password</button>
          {isAdmin && <button type="button" className="btn btn-dark" onClick={() => setInviting(true)}>+ Invite someone</button>}
        </div>
      </div>

      {!isAdmin && (
        <div style={{ ...card, padding: "12px 16px", font: "600 11.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "#9a6a12", background: "#fdf4e3", borderColor: "#f0dcae" }}>
          You have viewer access. You can open every screen, but only an admin can change anything.
        </div>
      )}

      {/* people with access */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ font: "700 13.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>People with access</div>
          <div style={{ font: "500 11px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
            Admins can change everything; viewers can only look.
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "34px 24px", textAlign: "center", font: "500 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>Loading…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: "34px 24px", textAlign: "center", font: "500 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>Nobody has access yet.</div>
        ) : (
          <div className="table-scroll">
            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid var(--line-soft)" }}>
              {["Person", "Role", "Since", "Action"].map((c) => <div key={c} style={th}>{c}</div>)}
            </div>

            {users.map((u) => {
              const isSelf = u.id === user?.id;
              const busy = busyId === u.id;
              return (
                <div key={u.id} className="row-hover" style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "13px 18px", borderBottom: "1px solid var(--surface)", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div aria-hidden style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "var(--grad)", color: "#fff", font: "700 11px 'Plus Jakarta Sans',sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {initials(u.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.name}{isSelf ? " (you)" : ""}
                      </div>
                      <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                    </div>
                  </div>

                  <div><Pill tone={u.role === "admin" ? "good" : "neutral"}>{ROLE_LABEL[u.role]}</Pill></div>
                  <div style={{ font: "600 11px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>{day(u.joinedAt)}</div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {!isAdmin || isSelf ? (
                      <span style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
                        {isSelf ? "Another admin manages your access" : "—"}
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const next: PortalRole = u.role === "admin" ? "viewer" : "admin";
                            void run(u.id, () => changeRole(u.id, next), `${u.name} is now ${ROLE_LABEL[next].toLowerCase()}`);
                          }}
                          style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)" }}
                        >
                          {u.role === "admin" ? "Make viewer" : "Make admin"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!confirm(`Remove ${u.name}'s access? Their account stays, but the portal stops opening for them. You can invite them again later.`)) return;
                            void run(u.id, () => revokeAccess(u.id, u.email), `${u.name} no longer has access`);
                          }}
                          style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
                        >
                          Revoke
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* pending invites */}
      {invites.length > 0 && (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--line-soft)" }}>
            <div style={{ font: "700 13.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>Pending invites</div>
            <div style={{ font: "500 11px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
              Access starts the moment they open the link.
            </div>
          </div>

          <div className="table-scroll">
            <div style={{ display: "grid", gridTemplateColumns: INVITE_GRID, gap: 12, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid var(--line-soft)" }}>
              {["Invited", "Role", "Sent", "Action"].map((c) => <div key={c} style={th}>{c}</div>)}
            </div>

            {invites.map((i) => {
              const busy = busyId === i.id;
              return (
                <div key={i.id} className="row-hover" style={{ display: "grid", gridTemplateColumns: INVITE_GRID, gap: 12, padding: "13px 18px", borderBottom: "1px solid var(--surface)", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.email}</div>
                    {i.name && <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>{i.name}</div>}
                  </div>
                  <div><Pill tone="warn">{ROLE_LABEL[i.role]}</Pill></div>
                  <div style={{ font: "600 11px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>{day(i.createdAt)}</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(i.id, () => resendInvite(i.email), `Invite resent to ${i.email}`)}
                          style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)" }}
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!confirm(`Cancel the invite for ${i.email}? The link stops granting access.`)) return;
                            void run(i.id, () => cancelInvite(i.id), "Invite cancelled");
                          }}
                          style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <span style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && users.length <= 1 && invites.length === 0 && isAdmin && (
        <EmptyState
          title="You are the only one here"
          body="Invite the rest of the team by email. Pick viewer for anyone who should see the numbers without being able to change them."
          action={<button type="button" className="btn btn-primary" onClick={() => setInviting(true)}>Invite someone</button>}
        />
      )}

      {inviting && <InviteModal onClose={() => setInviting(false)} onSent={refresh} />}
      {passwordOpen && <PasswordModal onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}

/**
 * Invited people arrive through a link and have no password at all. This is
 * where they set one, so they are not dependent on their inbox every time.
 */
function PasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
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
    toast("Password updated");
    onClose();
  };

  return (
    <Modal title="Set your password" sub="Lets you sign in without waiting for an email link." onClose={onClose} width={420}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="New password">
          <PasswordInput value={value} onChange={setValue} autoComplete="new-password" placeholder="Minimum 8 characters" autoFocus />
        </Field>
        <Field label="Confirm">
          <PasswordInput value={again} onChange={setAgain} autoComplete="new-password" placeholder="Type it again" />
        </Field>
        {error && (
          <div role="alert" style={{ font: "600 11.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "10px 12px" }}>
            {error}
          </div>
        )}
        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
        </ModalActions>
      </form>
    </Modal>
  );
}
