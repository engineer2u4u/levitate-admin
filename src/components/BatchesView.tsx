"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { activeEnrolments, batchTaken, batchWindow, sessionsOf } from "@/lib/store";
import { useAdminData, useCatalogStatus } from "@/lib/useStore";
import type { Batch, BatchStatus } from "@/lib/types";
import BatchModal from "./BatchModal";
import CatalogState from "./CatalogState";
import { EmptyState, Pill, card, input } from "./ui";
import { useCanWrite } from "./AuthGate";

const TABS = [
  { key: "current", label: "Current", match: (s: BatchStatus) => s === "upcoming" || s === "running" },
  // The history: every run that has finished, kept with its learners.
  { key: "completed", label: "Completed", match: (s: BatchStatus) => s === "completed" },
  { key: "cancelled", label: "Cancelled", match: (s: BatchStatus) => s === "cancelled" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export const batchTone = (s: BatchStatus) =>
  s === "running" ? "good" : s === "upcoming" ? "warn" : s === "completed" ? "neutral" : "bad";

const LABEL: Record<BatchStatus, string> = { upcoming: "Upcoming", running: "Running", completed: "Completed", cancelled: "Cancelled" };

/** "3 Oct – 18 Oct 2026". */
export function dateRange(from: string | null, to: string | null): string {
  const fmt = (iso: string, year: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  if (!from) return "Dates to be set";
  if (!to || to === from) return fmt(from, true);
  return `${fmt(from, false)} – ${fmt(to, true)}`;
}

export default function BatchesView() {
  const data = useAdminData();
  const status = useCatalogStatus();
  const canWrite = useCanWrite();
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("current");

  // The course filter lives in the address (?course=posh-trainer), so a
  // course's Batches button can open this screen already filtered, and the
  // filtered view survives a reload or a shared link.
  const courseSlug = params.get("course") ?? "";
  const courseId = data.courses.find((c) => c.slug === courseSlug)?.id ?? "all";
  const setCourseId = (id: string) => {
    const slug = data.courses.find((c) => c.id === id)?.slug;
    router.replace(slug ? `/batches/?course=${slug}` : "/batches/");
  };
  const [creating, setCreating] = useState(false);

  const matcher = TABS.find((t) => t.key === tab)!.match;

  const groups = useMemo(() => {
    const shown = data.batches.filter((b) => matcher(b.status) && (courseId === "all" || b.courseId === courseId));
    // Finished runs read newest first; current ones soonest first.
    if (tab !== "current") shown.reverse();
    return data.courses
      .map((course) => ({ course, batches: shown.filter((b) => b.courseId === course.id) }))
      .filter((g) => g.batches.length);
  }, [data, matcher, courseId, tab]);

  const count = (t: (typeof TABS)[number]) => data.batches.filter((b) => t.match(b.status)).length;

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div role="tablist" aria-label="Batch status" style={{ display: "flex", gap: 4, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 3 }}>
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)} style={{ cursor: "pointer", border: "none", font: "700 11px 'Plus Jakarta Sans',sans-serif", color: on ? "var(--ink)" : "var(--muted)", background: on ? "#fff" : "transparent", borderRadius: 6, padding: "7px 12px" }}>
                {t.label} <span style={{ color: "var(--muted)", fontWeight: 600 }}>{count(t)}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course" style={{ ...input, width: 220, cursor: "pointer" }}>
            <option value="all">All courses</option>
            {data.courses.map((c) => <option key={c.id} value={c.id}>{c.short || c.title}</option>)}
          </select>
          {canWrite && <button type="button" className="btn btn-dark" onClick={() => setCreating(true)}>+ New batch</button>}
        </div>
      </div>

      {data.batches.length === 0 && status.state !== "ready" ? (
        <CatalogState status={status} what="batches" />
      ) : groups.length === 0 ? (
        <EmptyState
          title={tab === "current" ? "No batch is running or coming up" : tab === "completed" ? "No completed batches yet" : "Nothing cancelled"}
          body={tab === "current"
            ? "A batch is one run of a course — its dates, sessions, Zoom links and learners. Start the next run with New batch; you can copy the last run's schedule onto new dates."
            : "When a batch is marked completed it moves here, with its sessions and learners kept as a record."}
          action={canWrite && tab === "current" ? <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Create a batch</button> : undefined}
        />
      ) : (
        groups.map(({ course, batches }) => (
          <div key={course.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)", letterSpacing: ".11em", textTransform: "uppercase" }}>{course.title}</div>
            {batches.map((b) => <BatchRow key={b.id} batch={b} />)}
          </div>
        ))
      )}

      {creating && (
        <BatchModal
          courseId={courseId === "all" ? undefined : courseId}
          onClose={(created) => {
            setCreating(false);
            if (created) router.push(`/batches/view/?id=${created.id}`);
          }}
        />
      )}
    </div>
  );
}

function BatchRow({ batch }: { batch: Batch }) {
  const data = useAdminData();
  const taken = batchTaken(data, batch.id);
  const people = activeEnrolments(data, batch.id);
  const paid = people.filter((e) => e.status === "paid").length;
  const sessions = sessionsOf(data, batch.id);
  const { from, to } = batchWindow(data, batch);
  const pct = Math.min(100, Math.round((taken / Math.max(1, batch.seats)) * 100));
  const missingLinks = sessions.filter((s) => !data.sessionLinks.some((l) => l.sessionId === s.id && l.joinUrl)).length;

  return (
    <Link
      href={`/batches/view/?id=${batch.id}`}
      className="row-hover"
      style={{ ...card, display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr) auto", gap: 14, alignItems: "center", padding: "13px 16px", textDecoration: "none" }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ font: "700 13px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{batch.name}</span>
          <Pill tone={batchTone(batch.status)}>{LABEL[batch.status]}</Pill>
          {!batch.enrolmentOpen && batch.status !== "completed" && batch.status !== "cancelled" && <Pill tone="neutral">Enrolment closed</Pill>}
        </div>
        <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 3 }}>{dateRange(from, to)}</div>
      </div>
      <div style={{ font: "600 11px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>
        {sessions.length} session{sessions.length === 1 ? "" : "s"}
        {sessions.length > 0 && missingLinks > 0 && batch.status !== "completed" && batch.status !== "cancelled" && (
          <div style={{ color: "#9a6a12", fontWeight: 500, fontSize: 10.5 }}>{missingLinks} without a Zoom link</div>
        )}
      </div>
      <div>
        <div style={{ font: "700 11px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{taken}/{batch.seats} seats</div>
        <div style={{ height: 5, borderRadius: 999, background: "var(--line-soft)", marginTop: 5, overflow: "hidden" }}>
          <div style={{ height: 5, borderRadius: 999, width: `${pct}%`, background: "var(--grad)" }} />
        </div>
      </div>
      <div style={{ font: "600 11px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>
        {paid} paid
        {people.length - paid > 0 && <span style={{ color: "#9a6a12" }}> · {people.length - paid} pending</span>}
      </div>
      <span style={{ font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)" }}>Open →</span>
    </Link>
  );
}
