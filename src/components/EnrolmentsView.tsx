"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { inr } from "@/lib/format";
import { clearLegacyEnrolments, readLegacyEnrolments, setEnrolmentStatus } from "@/lib/store";
import { useAdminData, useCatalogStatus } from "@/lib/useStore";
import type { Enrolment, LegacyEnrolment } from "@/lib/types";
import CatalogState from "./CatalogState";
import EnrolmentShare from "./EnrolmentShare";
import { EmptyState, Pill, card, input, th } from "./ui";
import { PAYMENT_FILTERS, useEnrolDialog, usePaymentFilter, useToast } from "./AdminShell";
import { useCanWrite } from "./AuthGate";

// The Action column is dropped entirely for viewers rather than filled with
// disabled buttons — there is nothing there for them to reach.
const COLUMNS = ["Learner", "Course & batch", "Amount", "Status", "Action"];
const GRID_WRITE = "minmax(0,1.5fr) minmax(0,1.7fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,1.4fr)";
const GRID_READ = "minmax(0,1.5fr) minmax(0,1.7fr) minmax(0,.8fr) minmax(0,1fr)";

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export const statusPill = (e: Enrolment) =>
  e.status === "paid"
    ? <Pill tone="good">Paid</Pill>
    : e.status === "cancelled"
      ? <Pill tone="neutral">Cancelled</Pill>
      : <Pill tone="warn">Payment pending</Pill>;

/** A CSV cell, quoted, and defused so a name like "=HYPERLINK(…)" stays text. */
function cell(v: string | number | boolean): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadLegacy(rows: LegacyEnrolment[], courseTitle: (id: string) => string) {
  const head = ["Name", "Email", "Phone", "Course", "Amount (₹)", "Seats", "Paid", "Created"];
  const lines = [head.map(cell).join(",")];
  for (const e of rows) {
    lines.push([e.name, e.email, e.phone, courseTitle(e.courseId), (e.amountPaise / 100).toFixed(2), e.seats, e.paid ? "yes" : "no", e.createdAt].map(cell).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `levitate-browser-enrolments-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function EnrolmentsView() {
  const data = useAdminData();
  const toast = useToast();
  const openEnrol = useEnrolDialog();
  const canWrite = useCanWrite();
  // Shared with the shell, so its "awaiting payment" badge can preselect Unpaid.
  const { filter, setFilter } = usePaymentFilter();
  const [query, setQuery] = useState("");
  const [courseId, setCourseId] = useState("all");
  const [batchId, setBatchId] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const catalog = useCatalogStatus();
  const legacy = readLegacyEnrolments();

  const GRID = canWrite ? GRID_WRITE : GRID_READ;

  const batchesForFilter = data.batches.filter((b) => courseId === "all" || b.courseId === courseId);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.enrolments.filter((e) => {
      if (filter === "Paid" && e.status !== "paid") return false;
      if (filter === "Unpaid" && e.status !== "pending") return false;
      if (filter === "Cancelled" && e.status !== "cancelled") return false;
      if (filter === "All" && e.status === "cancelled") return false;
      if (courseId !== "all" && e.courseId !== courseId) return false;
      if (batchId !== "all" && e.batchId !== batchId) return false;
      if (needle) {
        const course = data.courses.find((c) => c.id === e.courseId)?.title ?? "";
        const batch = data.batches.find((b) => b.id === e.batchId)?.name ?? "";
        if (!`${e.name} ${e.email} ${e.phone} ${course} ${batch}`.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [data, filter, courseId, batchId, query]);

  const active = data.enrolments.filter((e) => e.status !== "cancelled");
  const paidTotal = active.filter((e) => e.status === "paid").reduce((a, e) => a + e.amountPaise, 0);
  const pending = active.filter((e) => e.status === "pending");
  const running = data.batches.filter((b) => b.status === "upcoming" || b.status === "running").length;

  const kpis = [
    { k: "Enrolled", v: String(active.length), sub: `${active.filter((e) => e.status === "paid").length} paid` },
    { k: "Collected", v: inr(paidTotal), sub: "Marked paid" },
    { k: "Awaiting payment", v: inr(pending.reduce((a, e) => a + e.amountPaise, 0)), sub: `${pending.length} pending` },
    { k: "Open batches", v: String(running), sub: "Upcoming or running" },
  ];

  const change = async (e: Enrolment, next: Enrolment["status"], message: string) => {
    setBusy(e.id);
    const res = await setEnrolmentStatus(e.id, next);
    setBusy(null);
    toast(res.ok ? message : res.error);
  };

  const ready = catalog.state === "ready";

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.k} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".11em", textTransform: "uppercase" }}>{k.k}</div>
            <div style={{ font: "700 25px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginTop: 6, letterSpacing: "-.01em" }}>{ready ? k.v : "—"}</div>
            <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {catalog.state === "error" && <CatalogState status={catalog} what="enrolments" />}

      {legacy.length > 0 && (
        <div style={{ ...card, padding: "14px 16px", background: "#fdf4e3", borderColor: "#f0dcae", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ font: "500 11.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--body)", maxWidth: 640 }}>
            <strong style={{ color: "#9a6a12" }}>{legacy.length} enrolment{legacy.length === 1 ? "" : "s"} only in this browser.</strong>{" "}
            Enrolments now live in the database, so these older ones are not shown anywhere. Download them, re-enter any real ones, then clear them.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-soft" onClick={() => downloadLegacy(legacy, (id) => data.courses.find((c) => c.id === id)?.title ?? id)}>
              Download CSV
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { if (confirm("Clear the enrolments stored only in this browser? Download them first if any are real.")) { clearLegacyEnrolments(); toast("Cleared"); } }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", display: "flex", flexDirection: "column", gap: 12, borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              {/* Arriving from the header badge lands on a filtered list, so the
                  heading says which one rather than always claiming "all". */}
              <div style={{ font: "700 13.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>
                {filter === "All" ? "Enrolments" : filter === "Paid" ? "Paid" : filter === "Unpaid" ? "Awaiting payment" : "Cancelled"}
              </div>
              <div style={{ font: "500 11px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
                {rows.length} shown · newest first{filter === "All" ? " · cancelled ones under Cancelled" : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div role="tablist" aria-label="Filter by payment" style={{ display: "flex", gap: 4, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 3 }}>
                {PAYMENT_FILTERS.map((f) => {
                  const on = filter === f;
                  return (
                    <button key={f} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f)} style={{ cursor: "pointer", border: "none", font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: on ? "var(--ink)" : "var(--muted)", background: on ? "#fff" : "transparent", borderRadius: 6, padding: "6px 11px" }}>
                      {f}
                    </button>
                  );
                })}
              </div>
              {canWrite && <button type="button" className="btn btn-dark" onClick={() => openEnrol()}>+ Enrol someone</button>}
            </div>
          </div>

          <div className="filter-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 10 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, phone, course, batch…"
              aria-label="Search enrolments"
              style={input}
            />
            <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setBatchId("all"); }} aria-label="Course" style={{ ...input, cursor: "pointer" }}>
              <option value="all">All courses</option>
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.short || c.title}</option>)}
            </select>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Batch" style={{ ...input, cursor: "pointer" }}>
              <option value="all">All batches</option>
              {batchesForFilter.map((b) => {
                const c = data.courses.find((x) => x.id === b.courseId);
                return <option key={b.id} value={b.id}>{courseId === "all" ? `${c?.short || c?.title || ""} · ` : ""}{b.name}</option>;
              })}
            </select>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "40px 24px", textAlign: "center", font: "500 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
            {!ready ? "Loading…" : data.enrolments.length === 0 ? "No enrolments yet." : "Nothing matches these filters."}
          </div>
        ) : (
          <div className="table-scroll">
            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid var(--line-soft)" }}>
              {(canWrite ? COLUMNS : COLUMNS.slice(0, -1)).map((c) => <div key={c} style={th}>{c}</div>)}
            </div>

            {rows.map((e) => {
              const course = data.courses.find((c) => c.id === e.courseId);
              const batch = data.batches.find((b) => b.id === e.batchId);
              const working = busy === e.id;
              return (
                <div key={e.id} className="row-hover" style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "13px 18px", borderBottom: "1px solid var(--surface)", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.name}{e.seats > 1 ? ` (${e.seats} seats)` : ""}
                    </div>
                    <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[e.email, e.phone].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "600 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {course?.short || course?.title || "—"}
                    </div>
                    <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
                      {batch ? <Link href={`/batches/view/?id=${batch.id}`} style={{ color: "var(--teal)", fontWeight: 700 }}>{batch.name}</Link> : "—"}
                      {" · "}{e.source === "Website" ? "Bought online" : "Added here"}
                    </div>
                  </div>
                  <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{inr(e.amountPaise)}</div>
                  <div>
                    {statusPill(e)}
                    <div style={{ font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 3 }}>
                      {e.status === "paid" ? day(e.paidAt) : e.status === "cancelled" ? day(e.cancelledAt) : `since ${day(e.createdAt)}`}
                      {e.userId ? " · has signed up" : ""}
                    </div>
                  </div>
                  {canWrite && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <EnrolmentShare enrolment={e} />
                      {e.status === "pending" && (
                        <button type="button" disabled={working} onClick={() => void change(e, "paid", `${e.name} marked as paid`)} style={action("var(--teal)")}>Mark paid</button>
                      )}
                      {e.status === "paid" && (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => { if (confirm(`Mark ${e.name} as unpaid? Their payment date is cleared.`)) void change(e, "pending", `${e.name} marked unpaid`); }}
                          style={action("var(--muted)")}
                        >
                          Mark unpaid
                        </button>
                      )}
                      {e.status !== "cancelled" ? (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => { if (confirm(`Cancel ${e.name}'s enrolment in ${batch?.name ?? "this batch"}? Their seat is freed; the record stays under Cancelled.`)) void change(e, "cancelled", "Enrolment cancelled"); }}
                          style={action("var(--muted)")}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button type="button" disabled={working} onClick={() => void change(e, "pending", "Enrolment restored as pending")} style={action("var(--teal)")}>Restore</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ready && data.batches.length === 0 && (
        <EmptyState
          title="Start with a batch"
          body="Enrolments are on a batch — one dated run of a course. Create the batch, then enrol people into it."
          action={<Link href="/batches" className="btn btn-primary" style={{ display: "inline-block" }}>Go to Batches</Link>}
        />
      )}
    </div>
  );
}

const action = (color: string) =>
  ({ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color }) as const;
