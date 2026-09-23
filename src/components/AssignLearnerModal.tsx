"use client";

import { useEffect, useMemo, useState } from "react";
import { assignLearner, batchTaken, batchWindow, listLearnerAccounts, type LearnerAccount } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { AdminData, Batch } from "@/lib/types";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

/**
 * Put an existing LMS account straight into a batch, with no payment.
 *
 * This is how the learner side gets tested end to end — sign up, assign, walk
 * the modules — and how a comped or replacement seat is given. It is
 * deliberately separate from "Enrol someone", which is for a real enquiry with
 * a payment link to send: this one takes money out of the picture and records
 * that it did, so the roster never reads as a sale.
 *
 * It opens from either end, because both are natural: from a batch you are
 * looking for a person, and from a person you are looking for a batch. Same
 * function underneath either way — two components rather than one branching
 * on its props, so each keeps its own state and its own hooks.
 *
 * Only accounts that already exist are offered. Someone with no account is an
 * enrolment by email instead, which they claim with their code when they sign
 * up.
 */
export default function AssignLearnerModal(
  props:
    | { batch: Batch; account?: undefined; onClose: () => void }
    | { account: LearnerAccount; batch?: undefined; onClose: () => void },
) {
  return props.batch
    ? <PickPerson batch={props.batch} onClose={props.onClose} />
    : <PickBatch account={props.account} onClose={props.onClose} />;
}

/* ------------------------------------------------------ shared pieces */

/** "3 Oct – 18 Oct 2026" for the batch rows. */
function window_(d: AdminData, b: Batch): string {
  const { from, to } = batchWindow(d, b);
  const fmt = (iso: string, year: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  if (!from) return "dates to be set";
  return !to || to === from ? fmt(from, true) : `${fmt(from, false)} – ${fmt(to, true)}`;
}

const rowButton = (on: boolean) =>
  ({
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    textAlign: "left",
    cursor: "pointer",
    border: "none",
    borderBottom: "1px solid var(--surface)",
    background: on ? "rgba(47,196,188,.1)" : "transparent",
    padding: "10px 13px",
  }) as const;

const primaryLine = { display: "block", font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const secondLine = { display: "block", font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const noteText = { flex: "none", font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" } as const;
const emptyBox = { padding: "18px 14px", textAlign: "center", font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" } as const;
const listBox = { border: "1px solid var(--line-soft)", borderRadius: 10, maxHeight: 260, overflowY: "auto", marginTop: 4 } as const;

function Actions({ ready, busy, onClose, onGo }: { ready: boolean; busy: boolean; onClose: () => void; onGo: () => void }) {
  return (
    <ModalActions>
      <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={onGo}>
        {busy ? "Assigning…" : "Give access"}
      </button>
    </ModalActions>
  );
}

/* ------------------------------------- opened from a batch: who? */

function PickPerson({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const data = useAdminData();
  const toast = useToast();
  const [accounts, setAccounts] = useState<LearnerAccount[] | null>(null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void listLearnerAccounts().then((rows) => {
      if (alive) setAccounts(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const course = data.courses.find((c) => c.id === batch.courseId);

  // Everyone already on this batch, so the list says so rather than letting
  // someone be "assigned" twice and look like a no-op.
  const already = new Map(
    data.enrolments
      .filter((e) => e.batchId === batch.id && e.status !== "cancelled")
      .map((e) => [e.userId ?? e.email.toLowerCase(), e.status] as const),
  );

  const q = query.trim().toLowerCase();
  const shown = (accounts ?? [])
    .filter((a) => !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
    .slice(0, 50);

  const assign = async () => {
    const who = (accounts ?? []).find((a) => a.id === chosen);
    setBusy(true);
    const res = await assignLearner(chosen, batch.id);
    setBusy(false);
    if (!res.ok) return toast(res.error);
    toast(`${who?.name ?? "That account"} now has access to ${batch.name}`);
    onClose();
  };

  return (
    <Modal
      title="Assign an account to this batch"
      sub={`${course?.title ?? "This course"} · ${batch.name} — access is given straight away, with no payment taken.`}
      onClose={onClose}
      width={620}
    >
      <Field label="Find an account" hint="Search by name or email. Only people who have already signed up on the LMS appear here.">
        <input style={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name@example.com" autoFocus />
      </Field>

      <div style={listBox}>
        {accounts === null ? (
          <div style={emptyBox}>Loading accounts…</div>
        ) : shown.length === 0 ? (
          <div style={emptyBox}>
            {accounts.length === 0
              ? "No accounts to show. Only an admin can list them, and there has to be at least one signup."
              : "No account matches that."}
          </div>
        ) : (
          shown.map((a) => {
            const has = already.get(a.id) ?? already.get(a.email.toLowerCase());
            return (
              <button key={a.id} type="button" onClick={() => setChosen(a.id)} style={rowButton(a.id === chosen)}>
                <span style={{ minWidth: 0 }}>
                  <span style={primaryLine}>{a.name}</span>
                  <span style={secondLine}>{a.email}</span>
                </span>
                {has && <span style={noteText}>{has === "paid" ? "Already has access" : "Already on this batch"}</span>}
              </button>
            );
          })
        )}
      </div>

      <Actions ready={Boolean(chosen)} busy={busy} onClose={onClose} onGo={() => void assign()} />
    </Modal>
  );
}

/* ------------------------------ opened from a person: which batch? */

function PickBatch({ account, onClose }: { account: LearnerAccount; onClose: () => void }) {
  const data = useAdminData();
  const toast = useToast();
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);

  // Every batch still running or to come, grouped under its course. Enrolment
  // being closed does not stop an admin handing out a seat, so those are
  // offered too and simply labelled.
  const byCourse = useMemo(() => {
    const groups = new Map<string, Batch[]>();
    for (const b of data.batches) {
      if (b.status !== "upcoming" && b.status !== "running") continue;
      groups.set(b.courseId, [...(groups.get(b.courseId) ?? []), b]);
    }
    return [...groups].map(([courseId, batches]) => ({
      title: data.courses.find((c) => c.id === courseId)?.title ?? "Course",
      batches,
    }));
  }, [data]);

  const mine = new Map(
    data.enrolments
      .filter((e) => e.status !== "cancelled" && (e.userId === account.id || e.email.toLowerCase() === account.email.toLowerCase()))
      .map((e) => [e.batchId, e.status] as const),
  );

  const assign = async () => {
    const target = data.batches.find((b) => b.id === chosen);
    setBusy(true);
    const res = await assignLearner(account.id, chosen);
    setBusy(false);
    if (!res.ok) return toast(res.error);
    toast(`${account.name} now has access to ${target?.name ?? "that batch"}`);
    onClose();
  };

  return (
    <Modal
      title={`Give ${account.name} access to a course`}
      sub={`${account.email} — access starts as soon as you choose a batch, with no payment taken.`}
      onClose={onClose}
      width={620}
    >
      <div style={listBox}>
        {byCourse.length === 0 ? (
          <div style={emptyBox}>No batch is running or upcoming. Create one on the course first, then assign.</div>
        ) : (
          byCourse.map((group) => (
            <div key={group.title}>
              <div style={{ position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid var(--line-soft)", padding: "7px 13px", font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase" }}>
                {group.title}
              </div>
              {group.batches.map((b) => {
                const has = mine.get(b.id);
                return (
                  <button key={b.id} type="button" onClick={() => setChosen(b.id)} style={rowButton(b.id === chosen)}>
                    <span style={{ minWidth: 0 }}>
                      <span style={primaryLine}>{b.name}</span>
                      <span style={secondLine}>
                        {window_(data, b)} · {batchTaken(data, b.id)}/{b.seats} seats
                        {b.enrolmentOpen ? "" : " · enrolment closed"}
                      </span>
                    </span>
                    {has && <span style={noteText}>{has === "paid" ? "Already has access" : "Already enrolled"}</span>}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <Actions ready={Boolean(chosen)} busy={busy} onClose={onClose} onGo={() => void assign()} />
    </Modal>
  );
}
