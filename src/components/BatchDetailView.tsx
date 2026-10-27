"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { inr } from "@/lib/format";
import {
  activeEnrolments,
  assessmentFor,
  batchTaken,
  batchWindow,
  certificateFor,
  isModuleOpen,
  linkFor,
  progressFor,
  removeBatch,
  removeSession,
  sessionsOf,
  setEnrolmentStatus,
  unassignLearner,
  updateBatch,
  zoomFor,
} from "@/lib/store";
import { useAdminData, useCatalogStatus } from "@/lib/useStore";
import { downloadXlsx } from "@/lib/xlsx";
import type { AdminData, BatchStatus, Enrolment, Session } from "@/lib/types";
import AssignLearnerModal from "./AssignLearnerModal";
import BatchZoomPanel from "./BatchZoomPanel";
import BatchModal from "./BatchModal";
import CompleteBatchModal from "./CompleteBatchModal";
import ModuleUnlockPanel from "./ModuleUnlockPanel";
import { batchTone, dateRange } from "./BatchesView";
import CatalogState from "./CatalogState";
import EnrolmentShare from "./EnrolmentShare";
import { statusPill } from "./EnrolmentsView";
import SessionModal from "./SessionModal";
import { EmptyState, Pill, card, th } from "./ui";
import { useEnrolDialog, useToast } from "./AdminShell";
import { useCanWrite } from "./AuthGate";

const LABEL: Record<BatchStatus, string> = { upcoming: "Upcoming", running: "Running", completed: "Completed", cancelled: "Cancelled" };

const textButton = (color: string) =>
  ({ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color }) as const;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const LEARNER_GRID = "minmax(0,1.8fr) minmax(0,.7fr) minmax(0,1fr) minmax(0,1.5fr)";

function LearnerRow({ enrolment: e, canWrite }: { enrolment: Enrolment; canWrite: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const change = async (next: Enrolment["status"], message: string, question?: string) => {
    if (question && !confirm(question)) return;
    setBusy(true);
    const res = await setEnrolmentStatus(e.id, next);
    setBusy(false);
    toast(res.ok ? message : res.error);
  };

  return (
    <div className="row-hover" style={{ display: "grid", gridTemplateColumns: LEARNER_GRID, gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--surface)", alignItems: "center", opacity: e.status === "cancelled" ? 0.6 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
        <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[e.email, e.phone].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div style={{ font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{inr(e.amountPaise)}</div>
      <div>
        {statusPill(e)}
        <div style={{ font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 3 }}>
          {e.userId ? (
            "Signed up on the LMS"
          ) : e.claimCode ? (
            <>
              Not signed up · code{" "}
              {/* Clickable because this is where the code is looked up weeks
                  later, when the enrolment screen it was issued on is gone. */}
              <button
                type="button"
                title="Copy this enrolment code"
                onClick={() => {
                  void navigator.clipboard?.writeText(e.claimCode).then(
                    () => toast("Enrolment code copied"),
                    () => toast("Could not copy — select it and copy manually"),
                  );
                }}
                style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--body)", letterSpacing: ".04em", textDecoration: "underline dotted" }}
              >
                {e.claimCode}
              </button>
            </>
          ) : (
            "No LMS account yet"
          )}
        </div>
        <ModuleDots enrolment={e} />
      </div>
      {canWrite && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <EnrolmentShare enrolment={e} />
          {e.status === "pending" && <button type="button" disabled={busy} onClick={() => void change("paid", `${e.name} marked as paid`)} style={textButton("var(--teal)")}>Mark paid</button>}
          {e.status === "paid" && (
            <button type="button" disabled={busy} onClick={() => void change("pending", `${e.name} marked unpaid`, `Mark ${e.name} as unpaid?`)} style={textButton("var(--muted)")}>Mark unpaid</button>
          )}
          {e.status !== "cancelled" ? (
            <button type="button" disabled={busy} onClick={() => void change("cancelled", "Enrolment cancelled", `Cancel ${e.name}'s enrolment? Their seat is freed; the record stays.`)} style={textButton("var(--muted)")}>Cancel</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void change("pending", "Restored as pending")} style={textButton("var(--teal)")}>Restore</button>
          )}
          {/* Takes the seat off the roster entirely — for a seat that was
              assigned by hand. A paid one is cancelled instead, which the
              database decides and reports back. */}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Remove ${e.name} from this batch? Their access ends. Lesson progress is kept in case they come back.`)) return;
              setBusy(true);
              const res = await unassignLearner(e.id);
              setBusy(false);
              toast(
                !res.ok
                  ? res.error
                  : res.outcome === "deleted"
                    ? `${e.name} removed from the batch`
                    : res.outcome === "certificate"
                      ? `Certificate ${res.certNo} was issued against this seat, so it was cancelled rather than deleted`
                      : `${e.name} paid for this seat, so the record was cancelled rather than deleted`,
              );
            }}
            style={textButton("#b4453f")}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The roster as a spreadsheet.
 *
 * What is on screen plus what the screen has no room for: the phone number,
 * the enrolment code, the lesson count and the certificate. This is the list
 * that gets worked from outside the admin — codes to send out, who to chase
 * before a session — so it carries the columns that errand needs rather than
 * only the ones the table shows.
 *
 * Cancelled seats are included and marked. Leaving them out of a file called
 * "roster" is how someone concludes a delegate was never enrolled.
 */
function exportRoster(data: AdminData, batch: { id: string; name: string; courseId: string }, people: Enrolment[]) {
  const course = data.courses.find((c) => c.id === batch.courseId);
  const modules = (course?.modules ?? []).filter((m) => m.itemIds?.length);
  const total = modules.reduce((a, m) => a + (m.itemIds?.length ?? 0), 0);

  const rows = [
    ["Name", "Email", "Phone", "Enrolment code", "Status", "Amount (₹)", "Signed up", "Lessons done", "Assessment", "Certificate"],
    ...people.map((e) => {
      const done = new Set(progressFor(data, e)?.completedItems ?? []);
      const finished = modules.reduce((a, m) => a + (m.itemIds ?? []).filter((id) => done.has(id)).length, 0);
      const sat = assessmentFor(data, e);
      const cert = certificateFor(data, e.id);
      return [
        e.name,
        e.email,
        e.phone,
        e.claimCode,
        e.status === "paid" ? "Paid" : e.status === "cancelled" ? "Cancelled" : "Payment pending",
        (e.amountPaise / 100).toFixed(2),
        e.userId ? "Yes" : "No",
        // Blank rather than "0 of 19" for someone with no account: they have
        // not failed to do the lessons, they cannot reach them yet.
        e.userId && total > 0 ? `${finished} of ${total}` : "",
        sat ? `${sat.bestScore} of ${sat.total}${sat.everPassed ? "" : " (not passed)"}` : "",
        cert ? (cert.revokedAt ? `${cert.certNo} (revoked)` : cert.certNo) : "",
      ];
    }),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  const stem = `${course?.short || course?.title || "course"} ${batch.name} roster ${stamp}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  downloadXlsx(rows, stem, batch.name, [26, 34, 18, 16, 16, 13, 11, 14, 18, 18]);
}

/**
 * One dot per module: filled when every lesson in it is done, half when some
 * are, hollow when none, faded while the module is still locked for the batch.
 */
function ModuleDots({ enrolment }: { enrolment: Enrolment }) {
  const data = useAdminData();
  const course = data.courses.find((c) => c.id === enrolment.courseId);
  const modules = (course?.modules ?? []).filter((m) => m.itemIds?.length);
  if (!modules.length || !enrolment.userId) return null;

  const done = new Set(progressFor(data, enrolment)?.completedItems ?? []);
  const sat = assessmentFor(data, enrolment);
  const total = modules.reduce((a, m) => a + (m.itemIds?.length ?? 0), 0);
  const finished = modules.reduce((a, m) => a + (m.itemIds ?? []).filter((id) => done.has(id)).length, 0);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 5, flexWrap: "wrap" }} aria-label={`${finished} of ${total} lessons done`}>
      {modules.map((m) => {
        const ids = m.itemIds ?? [];
        const n = ids.filter((id) => done.has(id)).length;
        const open = isModuleOpen(data, enrolment.batchId, m);
        const fill = n === ids.length ? "#2fc4bc" : n > 0 ? "linear-gradient(90deg,#2fc4bc 50%,#fff 50%)" : "#fff";
        return (
          <span
            key={m.id}
            title={`${m.title}: ${n}/${ids.length} done${open ? "" : " · locked"}`}
            style={{ width: 9, height: 9, borderRadius: "50%", border: "1.5px solid #2fc4bc", background: fill, opacity: open ? 1 : 0.35, flex: "none" }}
          />
        );
      })}
      <span style={{ font: "600 9.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginLeft: 4 }}>{finished}/{total}</span>
      {/* The assessment's score, which is the one mark that is kept. */}
      {sat && (
        <span
          title={`${sat.attempts} attempt${sat.attempts === 1 ? "" : "s"}, last on ${new Date(sat.lastAttemptAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
          style={{ font: "700 9.5px 'Plus Jakarta Sans',sans-serif", color: sat.everPassed ? "#136f6a" : "#b4453f", marginLeft: 4 }}
        >
          · Assessment {sat.bestScore}/{sat.total}
        </span>
      )}
    </div>
  );
}

const sectionHead = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" } as const;

/**
 * One batch: its sessions and their Zoom links, and everyone enrolled in it.
 *
 * Reached as /batches/view/?id=… — the admin is a static export, so there are
 * no per-batch pages to generate; the id travels in the query instead.
 */
export default function BatchDetailView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const data = useAdminData();
  const status = useCatalogStatus();
  const canWrite = useCanWrite();
  const toast = useToast();
  const openEnrol = useEnrolDialog();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [sessionModal, setSessionModal] = useState<Session | "new" | null>(null);
  const [completing, setCompleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [busy, setBusy] = useState(false);

  const batch = data.batches.find((b) => b.id === id);

  if (!batch) {
    return (
      <div style={{ padding: "22px 26px 60px" }}>
        {status.state !== "ready" ? (
          <CatalogState status={status} what="this batch" />
        ) : (
          <EmptyState
            title="Batch not found"
            body="It may have been deleted, or the link is incomplete."
            action={<Link href="/batches" className="btn btn-primary" style={{ display: "inline-block" }}>All batches</Link>}
          />
        )}
      </div>
    );
  }

  const course = data.courses.find((c) => c.id === batch.courseId);
  const sessions = sessionsOf(data, batch.id);
  // The last session's date, offered as the completion date — it is the right
  // answer most of the time, and wrong in a way that is obvious on sight.
  const lastSessionOn =
    sessions.map((s) => s.startsOn).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
  const people = data.enrolments.filter((e) => e.batchId === batch.id);
  const active = activeEnrolments(data, batch.id);
  const taken = batchTaken(data, batch.id);
  const { from, to } = batchWindow(data, batch);
  const finished = batch.status === "completed" || batch.status === "cancelled";

  const setStatus = async (next: BatchStatus, question?: string) => {
    if (question && !confirm(question)) return;
    setBusy(true);
    const res = await updateBatch(batch.id, { status: next });
    setBusy(false);
    toast(res.ok ? `${batch.name} marked ${LABEL[next].toLowerCase()}` : res.error);
  };

  /** Completing goes through the dialog, because it needs a date. */
  const complete = async (completedOn: string) => {
    setBusy(true);
    const res = await updateBatch(batch.id, { status: "completed", completedOn });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    setCompleting(false);
    toast(`${batch.name} completed — certificates are dated ${day(completedOn)}`);
  };

  const onDelete = async () => {
    if (!confirm(`Delete ${batch.name}? Its ${sessions.length} session(s) and their Zoom links go too. This cannot be undone.`)) return;
    const res = await removeBatch(batch.id);
    if (!res.ok) return toast(res.error);
    if (res.blocked) return toast("People are enrolled in this batch — cancel it instead, which keeps the record.");
    toast("Batch deleted");
    router.push("/batches");
  };

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <Link href="/batches" style={{ font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>← All batches</Link>

      {/* ---------------------------------------------------------- summary */}
      <div style={{ ...card, padding: "16px 18px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)", letterSpacing: ".11em", textTransform: "uppercase" }}>{course?.title ?? "—"}</div>
          <div style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
            <span style={{ font: "700 18px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{batch.name}</span>
            <Pill tone={batchTone(batch.status)}>{LABEL[batch.status]}</Pill>
            {!batch.enrolmentOpen && !finished && <Pill tone="neutral">Enrolment closed</Pill>}
          </div>
          <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 5 }}>
            {dateRange(from, to)} · {taken}/{batch.seats} seats · {active.filter((e) => e.status === "paid").length} paid
            {batch.completedOn
              ? ` · ${LABEL[batch.status].toLowerCase()} ${day(batch.completedOn)}`
              : batch.completedAt
                ? ` · ${LABEL[batch.status].toLowerCase()} ${day(batch.completedAt)}`
                : ""}
          </div>
        </div>

        {canWrite && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {batch.status === "upcoming" && (
              <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void setStatus("running")}>Mark running</button>
            )}
            {(batch.status === "upcoming" || batch.status === "running") && (
              <button
                type="button"
                className="btn btn-dark"
                disabled={busy}
                onClick={() => setCompleting(true)}
              >
                Mark completed
              </button>
            )}
            {finished && (
              <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void setStatus("running", `Reopen ${batch.name}? Its sessions stay closed until you open them again.`)}>
                Reopen
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>
            {batch.status !== "cancelled" && (
              <button type="button" disabled={busy} onClick={() => void setStatus("cancelled", `Cancel ${batch.name}? Its sessions close. Enrolments are kept.`)} style={textButton("var(--muted)")}>
                Cancel batch
              </button>
            )}
            {people.length === 0 && (
              <button type="button" onClick={() => void onDelete()} style={textButton("#9a2c2c")}>Delete</button>
            )}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- sessions */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={sectionHead}>
          <div>
            <div style={{ font: "700 13px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>Live sessions</div>
            <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>Dates and Zoom links for this run. Links stay private.</div>
          </div>
          {canWrite && !finished && <button type="button" className="btn btn-soft" onClick={() => setSessionModal("new")}>+ Add session</button>}
        </div>
        {sessions.length === 0 ? (
          <div style={{ padding: "22px 16px", textAlign: "center", font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>No sessions yet.</div>
        ) : (
          <div className="table-scroll">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.8fr) minmax(0,1.2fr) minmax(0,.8fr)", gap: 12, padding: "9px 16px", background: "#f8fafc", borderBottom: "1px solid var(--line-soft)" }}>
              {["Date", "Topic", "Zoom", ""].map((h) => <div key={h} style={th}>{h}</div>)}
            </div>
            {sessions.map((s) => {
              const link = linkFor(data, s.id);
              const room = zoomFor(data, s);
              return (
                <div key={s.id} className="row-hover" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.8fr) minmax(0,1.2fr) minmax(0,.8fr)", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--surface)", alignItems: "center" }}>
                  <div>
                    <div style={{ font: "600 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>{s.date || "No date"}</div>
                    <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>{s.time}{s.status !== "open" ? ` · ${s.status}` : ""}</div>
                  </div>
                  <div style={{ font: "500 11.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.topic || <span style={{ color: "var(--muted)" }}>—</span>}</div>
                  <div style={{ font: "600 10.5px 'Plus Jakarta Sans',sans-serif", minWidth: 0 }}>
                    {/* A session's own room, the batch's, or none — three
                        states that must not look like two. */}
                    {room.joinUrl ? (
                      <a href={room.joinUrl} target="_blank" rel="noopener noreferrer" style={{ color: room.inherited ? "var(--muted)" : "#136f6a" }}>
                        {room.inherited ? "Batch room ↗" : "Join link set ↗"}
                      </a>
                    ) : (
                      <span style={{ color: "#9a6a12" }}>No link yet</span>
                    )}
                    {link?.recordingUrl && (
                      <div>
                        <a href={link.recordingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>Recording ↗</a>
                        {/* Shown beside the link, and flagged when it is not
                            there: a recording link without its passcode is a
                            link nobody can open. */}
                        {link.recordingPasscode ? (
                          <span style={{ color: "var(--muted)", fontWeight: 500 }}> · {link.recordingPasscode}</span>
                        ) : (
                          <span style={{ color: "#9a6a12", fontWeight: 500 }}> · no passcode</span>
                        )}
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => setSessionModal(s)} style={textButton("var(--teal)")}>Edit</button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete the session on ${s.date || "this date"}?`)) return;
                          const res = await removeSession(s.id);
                          toast(res.ok ? "Session deleted" : res.error);
                        }}
                        style={textButton("var(--muted)")}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BatchZoomPanel batch={batch} canWrite={canWrite} />

      <ModuleUnlockPanel batch={batch} canWrite={canWrite} />

      {/* --------------------------------------------------------- learners */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={sectionHead}>
          <div>
            <div style={{ font: "700 13px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>Learners</div>
            <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
              {active.length} enrolled{people.length > active.length ? ` · ${people.length - active.length} cancelled` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {/* The roster below is this batch at a glance; Enrolments is where
                the money is — amounts, payment links, share and CSV — so it
                opens already filtered to this batch. */}
            {people.length > 0 && (
              <>
                <button type="button" className="btn btn-soft" onClick={() => exportRoster(data, batch, people)}>
                  Download Excel
                </button>
                <Link href={`/enrolments/?batch=${batch.id}`} className="btn btn-soft" style={{ display: "inline-block" }}>
                  Open in Enrolments
                </Link>
              </>
            )}
            {canWrite && !finished && (
              <>
                <button type="button" className="btn btn-soft" onClick={() => setAssigning(true)}>Assign an account</button>
                <button type="button" className="btn btn-dark" onClick={() => openEnrol({ batchId: batch.id })}>+ Enrol someone</button>
              </>
            )}
          </div>
        </div>
        {people.length === 0 ? (
          <div style={{ padding: "22px 16px", textAlign: "center", font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>Nobody enrolled yet.</div>
        ) : (
          <div className="table-scroll">
            <div style={{ display: "grid", gridTemplateColumns: LEARNER_GRID, gap: 12, padding: "9px 16px", background: "#f8fafc", borderBottom: "1px solid var(--line-soft)" }}>
              {["Learner", "Amount", "Status", canWrite ? "Action" : ""].map((h) => <div key={h} style={th}>{h}</div>)}
            </div>
            {people.map((e) => <LearnerRow key={e.id} enrolment={e} canWrite={canWrite} />)}
          </div>
        )}
      </div>

      {editing && <BatchModal batch={batch} onClose={() => setEditing(false)} />}
      {completing && (
        <CompleteBatchModal
          batch={batch}
          lastSessionOn={lastSessionOn}
          busy={busy}
          onClose={() => setCompleting(false)}
          onConfirm={(on) => void complete(on)}
        />
      )}
      {assigning && <AssignLearnerModal batch={batch} onClose={() => setAssigning(false)} />}
      {sessionModal && (
        <SessionModal session={sessionModal === "new" ? undefined : sessionModal} batchId={batch.id} onClose={() => setSessionModal(null)} />
      )}
    </div>
  );
}
