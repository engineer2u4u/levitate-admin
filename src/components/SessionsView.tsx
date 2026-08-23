"use client";

import { useState } from "react";
import { effectiveStatus, removeSession, seatsTaken } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { Session } from "@/lib/types";
import SessionModal from "./SessionModal";
import { EmptyState, Pill, card, th } from "./ui";
import { useEnrolDialog, useToast } from "./AdminShell";

const GRID = "1.8fr 1.1fr 1fr 1.1fr .9fr 1.1fr";

export default function SessionsView() {
  const data = useAdminData();
  const toast = useToast();
  const openEnrol = useEnrolDialog();
  const [editing, setEditing] = useState<Session | "new" | null>(null);

  const tone = (label: string) =>
    label === "Full" ? "bad" : label === "Draft" || label === "Closed" ? "neutral" : label === "Filling" ? "warn" : "good";

  const onDelete = (s: Session) => {
    const { blocked } = removeSession(s.id);
    if (blocked) {
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
        <button type="button" className="btn btn-dark" onClick={() => setEditing("new")}>+ New session</button>
      </div>

      {data.sessions.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          body="A session is a dated run of a course — it carries the date, facilitator and seat count that enrolments book against."
          action={<button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>Schedule a session</button>}
        />
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div className="table-scroll">
            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid var(--line-soft)" }}>
              {["Course", "Date", "Facilitator", "Seats", "Status", "Action"].map((c) => <div key={c} style={th}>{c}</div>)}
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
                    <button type="button" onClick={() => onDelete(s)} style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>Delete</button>
                  </div>
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
