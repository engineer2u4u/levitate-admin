"use client";

import { useState } from "react";
import { isModuleOpen, relockModule, sessionsOf, unlockModules } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { Batch } from "@/lib/types";
import { card } from "./ui";
import { useToast } from "./AdminShell";

const sectionHead = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" } as const;

/**
 * Opens modules for the whole batch after a live session.
 *
 * Tick the modules that session covered, pick the session, and unlock: every
 * paid learner in the batch sees them on their next visit to the LMS. Until
 * then a module shows as waiting for the next live session.
 */
export default function ModuleUnlockPanel({ batch, canWrite }: { batch: Batch; canWrite: boolean }) {
  const data = useAdminData();
  const toast = useToast();
  const course = data.courses.find((c) => c.id === batch.courseId);
  const modules = course?.modules ?? [];
  const sessions = sessionsOf(data, batch.id).filter((s) => s.startsOn);

  // Default to the most recent session that has already happened.
  const today = new Date().toISOString().slice(0, 10);
  const lastHeld = [...sessions].reverse().find((s) => (s.startsOn ?? "") <= today);
  const [afterSession, setAfterSession] = useState(lastHeld?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  if (modules.length === 0) return null;

  const paid = data.enrolments.filter((e) => e.batchId === batch.id && e.status === "paid").length;
  const open = modules.filter((m) => isModuleOpen(data, batch.id, m));

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const unlock = async () => {
    if (!picked.size) return;
    const names = modules.filter((m) => picked.has(m.id)).map((m) => m.title);
    if (!confirm(`Unlock for all ${paid} paid learner${paid === 1 ? "" : "s"} in ${batch.name}?\n\n• ${names.join("\n• ")}`)) return;
    setBusy(true);
    const res = await unlockModules(batch.id, [...picked], afterSession || null);
    setBusy(false);
    if (!res.ok) return toast(res.error);
    setPicked(new Set());
    toast(`${names.length} module${names.length === 1 ? "" : "s"} unlocked for ${batch.name}`);
  };

  const relock = async (id: string, title: string) => {
    if (!confirm(`Lock "${title}" again for ${batch.name}? Learners keep the progress they made in it.`)) return;
    const res = await relockModule(batch.id, id);
    toast(res.ok ? `"${title}" locked again` : res.error);
  };

  const unlockedAt = (id: string) => data.moduleUnlocks.find((u) => u.batchId === batch.id && u.moduleId === id);

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={sectionHead}>
        <div>
          <div style={{ font: "700 13px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>Modules</div>
          <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
            {open.length} of {modules.length} open for this batch. After a live session, tick what it covered and unlock.
          </div>
        </div>
        {canWrite && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={afterSession}
              onChange={(e) => setAfterSession(e.target.value)}
              aria-label="After which session"
              style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", font: "500 11.5px 'Plus Jakarta Sans',sans-serif", background: "#fff" }}
            >
              <option value="">After no particular session</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>After {s.date}{s.topic ? ` · ${s.topic}` : ""}</option>)}
            </select>
            <button type="button" className="btn btn-primary" disabled={busy || picked.size === 0} onClick={() => void unlock()}>
              {busy ? "Unlocking…" : picked.size ? `Unlock ${picked.size} for the batch` : "Tick modules to unlock"}
            </button>
          </div>
        )}
      </div>

      {modules.map((m, i) => {
        const isOpen = isModuleOpen(data, batch.id, m);
        const row = unlockedAt(m.id);
        const session = row?.afterSessionId ? data.sessions.find((s) => s.id === row.afterSessionId) : null;
        return (
          <label
            key={m.id}
            className="row-hover"
            style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 16px", borderBottom: "1px solid var(--surface)", cursor: canWrite && !isOpen ? "pointer" : "default" }}
          >
            {canWrite && (
              <input
                type="checkbox"
                checked={isOpen || picked.has(m.id)}
                disabled={isOpen}
                onChange={() => toggle(m.id)}
                style={{ accentColor: "#2fc4bc", flex: "none" }}
              />
            )}
            <span style={{ width: 22, flex: "none", textAlign: "right", font: "700 11px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>{i + 1}.</span>
            <span style={{ flex: 1, minWidth: 0, font: "600 12px 'Plus Jakarta Sans',sans-serif", color: isOpen ? "var(--ink)" : "var(--body)" }}>
              {m.title}
              <span style={{ display: "block", font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
                {m.release === "enrolment"
                  ? "Open from enrolment"
                  : row
                    ? `Unlocked ${new Date(row.unlockedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}${session ? ` after ${session.date}` : ""}`
                    : "Locked — waits for a live session"}
                {m.itemIds?.length ? ` · ${m.itemIds.length} lesson${m.itemIds.length === 1 ? "" : "s"}` : ""}
              </span>
            </span>
            <span style={{ flex: "none", font: "800 9.5px 'Plus Jakarta Sans',sans-serif", borderRadius: 999, padding: "4px 9px", color: isOpen ? "#136f6a" : "#5b6b7c", background: isOpen ? "#eafaf8" : "#eef2f6" }}>
              {isOpen ? "Open" : "Locked"}
            </span>
            {canWrite && row && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); void relock(m.id, m.title); }}
                style={{ flex: "none", cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
              >
                Lock again
              </button>
            )}
          </label>
        );
      })}
    </div>
  );
}
