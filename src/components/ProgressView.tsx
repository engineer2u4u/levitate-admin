"use client";

import { useEffect, useState } from "react";
import { listProgress, outlineFor, summarise, type ProgressRow } from "@/lib/progress";
import { initials } from "@/lib/format";
import { EmptyState, Modal, Pill, card, th } from "./ui";

const GRID = "2fr 1.6fr 1.2fr 1fr 1fr";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Each learner's journey through a self-paced course.
 *
 * One row per learner per course, newest activity first. Opening a row shows
 * the item-by-item trail, because "60% done" does not answer the question that
 * actually gets asked — which is where someone stopped.
 */
export default function ProgressView() {
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<ProgressRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProgress()
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div style={{ ...card, padding: 24, color: "#5b6e82" }}>Loading learner journeys…</div>;

  if (error) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <div style={{ font: "700 15px 'Plus Jakarta Sans',sans-serif", color: "#0a1b33", marginBottom: 6 }}>
          Could not load progress
        </div>
        <div style={{ font: "400 13.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "#5b6e82" }}>{error}</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No one has started a course yet"
        body="A row appears here the moment a learner opens a self-paced course on the website. Progress is written as they go, so this stays current without anyone updating it."
      />
    );
  }

  return (
    <>
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "14px 20px", borderBottom: "1px solid #e3eaf0" }}>
          <div style={th}>Learner</div>
          <div style={th}>Course</div>
          <div style={th}>Progress</div>
          <div style={th}>Status</div>
          <div style={th}>Last active</div>
        </div>

        {rows.map((r) => {
          const s = summarise(r);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpen(r)}
              style={{
                display: "grid", gridTemplateColumns: GRID, gap: 12, width: "100%", textAlign: "left",
                padding: "14px 20px", borderBottom: "1px solid #eef2f6", border: "none",
                background: "transparent", cursor: "pointer", alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                <span aria-hidden style={{ flex: "none", width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#2fc4bc,#2f7fd6)", color: "#fff", font: "700 12px 'Plus Jakarta Sans',sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {initials(r.learner_name || "?")}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", font: "700 13.5px 'Plus Jakarta Sans',sans-serif", color: "#0a1b33", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.learner_name || "Unnamed learner"}
                  </span>
                  {r.learner_org && (
                    <span style={{ display: "block", font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "#8296a9" }}>{r.learner_org}</span>
                  )}
                </span>
              </div>

              <div style={{ font: "600 13px 'Plus Jakarta Sans',sans-serif", color: "#3d5064" }}>
                {outlineFor(r.course_slug)?.title ?? r.course_slug}
              </div>

              <div>
                <div style={{ height: 6, borderRadius: 999, background: "#e3eaf0", overflow: "hidden", marginBottom: 5 }}>
                  <div style={{ width: `${s.percent}%`, height: "100%", background: "linear-gradient(90deg,#2fc4bc,#2f7fd6)" }} />
                </div>
                <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "#8296a9" }}>
                  {s.done} of {s.total || "?"} · {s.percent}%
                </div>
              </div>

              <div>
                {s.finished ? <Pill tone="good">Completed</Pill> : s.done === 0 ? <Pill tone="neutral">Started</Pill> : <Pill tone="warn">In progress</Pill>}
              </div>

              <div style={{ font: "500 12.5px 'Plus Jakarta Sans',sans-serif", color: "#5b6e82" }}>{when(r.updated_at)}</div>
            </button>
          );
        })}
      </div>

      {open && <JourneyModal row={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The item-by-item trail: what was finished, in what order, and where it stopped. */
function JourneyModal({ row, onClose }: { row: ProgressRow; onClose: () => void }) {
  const outline = outlineFor(row.course_slug);
  const s = summarise(row);
  const done = new Set(row.completed_items ?? []);
  const order = new Map((row.completed_items ?? []).map((id, i) => [id, i + 1]));

  return (
    <Modal
      title={row.learner_name || "Unnamed learner"}
      sub={`${outline?.title ?? row.course_slug} · started ${day(row.started_at)}`}
      onClose={onClose}
      width={640}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Pill tone={s.finished ? "good" : "warn"}>{s.percent}% complete</Pill>
        <Pill tone="neutral">{s.done} of {s.total || "?"} items</Pill>
        {row.completed_at && <Pill tone="good">Finished {day(row.completed_at)}</Pill>}
      </div>

      {!outline ? (
        <div style={{ font: "400 13.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "#5b6e82" }}>
          This course has no outline in the admin yet, so only the totals can be shown. The learner has finished{" "}
          {row.completed_items.length} item{row.completed_items.length === 1 ? "" : "s"}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {outline.items.map((it, i) => {
            const isDone = done.has(it.id);
            const attempt = row.quiz_attempts?.[it.id];
            // The first unfinished item is where they are now.
            const isCurrent = !isDone && outline.items.slice(0, i).every((p) => done.has(p.id));
            return (
              <div
                key={it.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 10,
                  background: isCurrent ? "#eef4f7" : "transparent",
                }}
              >
                <span aria-hidden style={{ flex: "none", width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: "700 10px 'Plus Jakarta Sans',sans-serif", background: isDone ? "#1b8f88" : "#e3eaf0", color: isDone ? "#fff" : "#8296a9" }}>
                  {isDone ? order.get(it.id) ?? "✓" : i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", font: "600 13px 'Plus Jakarta Sans',sans-serif", color: isDone ? "#0a1b33" : "#8296a9" }}>{it.title}</span>
                  <span style={{ display: "block", font: "500 11px 'Plus Jakarta Sans',sans-serif", color: "#a9b8c6" }}>{it.module} · {it.kind}</span>
                </span>
                {attempt && <Pill tone={attempt.score === attempt.total ? "good" : "warn"}>{attempt.score}/{attempt.total}</Pill>}
                {isCurrent && <Pill tone="neutral">Here now</Pill>}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
