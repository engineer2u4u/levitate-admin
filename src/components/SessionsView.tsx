"use client";

import { useState } from "react";
import { effectiveStatus, removeSession, seatsTaken } from "@/lib/store";
import { useAdminData, useCatalogStatus } from "@/lib/useStore";
import type { Session } from "@/lib/types";
import CatalogState from "./CatalogState";
import SessionModal from "./SessionModal";
import { EmptyState, Pill, card, th } from "./ui";
import { useEnrolDialog, useToast } from "./AdminShell";
import { useCanWrite } from "./AuthGate";

// Viewers lose the Action column outright rather than getting a row of
// disabled buttons.
const COLUMNS = ["Course", "Date", "Facilitator", "Seats", "Status", "Action"];
const GRID_WRITE = "1.8fr 1.1fr 1fr 1.1fr .9fr 1.1fr";
const GRID_READ = "1.8fr 1.1fr 1fr 1.1fr .9fr";

export default function SessionsView() {
  const data = useAdminData();
  const status = useCatalogStatus();
  const toast = useToast();
  const openEnrol = useEnrolDialog();
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<Session | "new" | null>(null);

  const GRID = canWrite ? GRID_WRITE : GRID_READ;

  const tone = (label: string) =>
    label === "Full" ? "bad" : label === "Draft" || label === "Closed" ? "neutral" : label === "Filling" ? "warn" : "good";

  const onDelete = async (s: Session) => {
    const res = await removeSession(s.id);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    if (res.blocked) {
      toast("Cannot delete — people are enrolled on that session");
      return;
    }
    toast("Session deleted");
  };

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
          {data.sessions.length} session{data.sessions.length === 1 ? "" : "s"} scheduled
        </div>
        {canWrite && <button type="button" className="btn btn-dark" onClick={() => setEditing("new")}>+ New session</button>}
      </div>

      {data.sessions.length === 0 && status.state !== "ready" ? (
        <CatalogState status={status} what="sessions" />
      ) : data.sessions.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          body={canWrite
            ? "A session is a dated run of a course — it carries the date, facilitator and seat count that enrolments book against."
            : "No dates have been scheduled yet. An admin adds them; you will see them here once they do."}
          action={canWrite ? <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>Schedule a session</button> : undefined}
        />
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div className="table-scroll">
            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid var(--line-soft)" }}>
              {(canWrite ? COLUMNS : COLUMNS.slice(0, -1)).map((c) => <div key={c} style={th}>{c}</div>)}
            </div>

            {data.sessions.map((s) => {
              const course = data.courses.find((c) => c.id === s.courseId);
              const taken = seatsTaken(data, s.id);
              const pct = Math.min(100, Math.round((taken / Math.max(1, s.seats)) * 100));
              const label = effectiveStatus(data, s);
              const bookable = label !== "Full" && label !== "Closed";
              return (
                <div key={s.id} className="row-hover" style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "13px 18px", borderBottom: "1px solid var(--surface)", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course?.title ?? "— deleted course —"}</div>
                    <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>{s.mode}</div>
                  </div>
                  <div>
                    <div style={{ font: "600 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>{s.date}</div>
                    <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>{s.time}</div>
                  </div>
                  <div style={{ font: "600 11px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>{s.trainer}</div>
                  <div>
                    <div style={{ font: "700 11px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{taken}/{s.seats}</div>
                    <div style={{ height: 5, borderRadius: 999, background: "var(--line-soft)", marginTop: 5, overflow: "hidden" }}>
                      <div style={{ height: 5, borderRadius: 999, width: `${pct}%`, background: "var(--grad)" }} />
                    </div>
                  </div>
                  <div><Pill tone={tone(label)}>{label}</Pill></div>
                  {canWrite && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={!bookable}
                        onClick={() => openEnrol({ courseId: s.courseId, sessionId: s.id })}
                        style={{ cursor: bookable ? "pointer" : "not-allowed", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: bookable ? "var(--teal)" : "var(--muted)" }}
                      >
                        Enrol someone
                      </button>
                      <button type="button" onClick={() => setEditing(s)} style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>Edit</button>
                      <button type="button" onClick={() => void onDelete(s)} style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && <SessionModal session={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
