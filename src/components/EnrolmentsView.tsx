"use client";

import { useState } from "react";
import { inr } from "@/lib/format";
import { markPaid, removeEnrolment } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import { EmptyState, Pill, card, th } from "./ui";
import { PAYMENT_FILTERS, useEnrolDialog, usePaymentFilter, useToast } from "./AdminShell";
import { useCanWrite } from "./AuthGate";

// The Action column is dropped entirely for viewers rather than filled with
// disabled buttons — there is nothing there for them to reach.
const COLUMNS = ["Customer", "Course & session", "Source", "Amount", "Status", "Action"];
const GRID_WRITE = "1.5fr 1.8fr .9fr .9fr 1fr .9fr";
const GRID_READ = "1.5fr 1.8fr .9fr .9fr 1fr";

export default function EnrolmentsView() {
  const data = useAdminData();
  const toast = useToast();
  const openEnrol = useEnrolDialog();
  const canWrite = useCanWrite();
  // Shared with the shell, so its "awaiting payment" badge can preselect Unpaid.
  const { filter, setFilter } = usePaymentFilter();
  const [query, setQuery] = useState("");

  const GRID = canWrite ? GRID_WRITE : GRID_READ;

  const rows = data.enrolments
    .filter((e) => (filter === "All" ? true : filter === "Paid" ? e.paid : !e.paid))
    .filter((e) => {
      if (!query.trim()) return true;
      const course = data.courses.find((c) => c.id === e.courseId)?.title ?? "";
      return `${e.name} ${e.email} ${e.phone} ${course}`.toLowerCase().includes(query.trim().toLowerCase());
    });

  const paidTotal = data.enrolments.filter((e) => e.paid).reduce((a, e) => a + e.amountPaise, 0);
  const dueTotal = data.enrolments.filter((e) => !e.paid).reduce((a, e) => a + e.amountPaise, 0);
  const openSessions = data.sessions.filter((s) => s.status !== "draft" && s.status !== "closed").length;

  const kpis = [
    { k: "Total enrolments", v: String(data.enrolments.length), sub: `Across ${data.courses.length} courses` },
    { k: "Collected", v: inr(paidTotal), sub: "Cleared payments" },
    { k: "Awaiting payment", v: inr(dueTotal), sub: `${data.enrolments.filter((e) => !e.paid).length} open` },
    { k: "Scheduled sessions", v: String(openSessions), sub: "Open for booking" },
  ];

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.k} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".11em", textTransform: "uppercase" }}>{k.k}</div>
            <div style={{ font: "700 25px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginTop: 6, letterSpacing: "-.01em" }}>{k.v}</div>
            <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
          <div>
            {/* Arriving from the header badge lands on a filtered list, so the
                heading says which one rather than always claiming "all". */}
            <div style={{ font: "700 13.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>
              {filter === "All" ? "All enrolments" : filter === "Paid" ? "Paid enrolments" : "Awaiting payment"}
            </div>
            <div style={{ font: "500 11px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
              {filter === "All"
                ? "Newest first · includes phone enrolments you created"
                : `${rows.length} of ${data.enrolments.length} · newest first`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, course…"
              aria-label="Search enrolments"
              style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 11px", font: "500 11.5px 'Plus Jakarta Sans',sans-serif", width: 210 }}
            />
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
            {canWrite && <button type="button" className="btn btn-dark" onClick={() => openEnrol()}>+ Enrol a customer</button>}
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "40px 24px", textAlign: "center", font: "500 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
            {data.enrolments.length === 0 ? "No enrolments yet." : "Nothing matches that filter."}
          </div>
        ) : (
          <div className="table-scroll">
            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid var(--line-soft)" }}>
              {(canWrite ? COLUMNS : COLUMNS.slice(0, -1)).map((c) => <div key={c} style={th}>{c}</div>)}
            </div>

            {rows.map((e) => {
              const course = data.courses.find((c) => c.id === e.courseId);
              const session = data.sessions.find((s) => s.id === e.sessionId);
              return (
                <div key={e.id} className="row-hover" style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "13px 18px", borderBottom: "1px solid var(--surface)", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.name}{e.seats > 1 ? ` (${e.seats} seats)` : ""}
                    </div>
                    <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.phone || e.email}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "600 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course?.title ?? "— deleted course —"}</div>
                    <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>{session ? `${session.date} · ${session.mode}` : "—"}</div>
                  </div>
                  <div style={{ font: "600 11px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>{e.source}</div>
                  <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{inr(e.amountPaise)}</div>
                  <div><Pill tone={e.paid ? "good" : "warn"}>{e.paid ? "Paid" : e.method === "invoice" ? "Invoiced" : "Awaiting payment"}</Pill></div>
                  {canWrite && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => { markPaid(e.id, !e.paid); toast(e.paid ? `${e.name} marked unpaid` : `${e.name} marked as paid`); }}
                        style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)" }}
                      >
                        {e.paid ? "Mark unpaid" : "Mark paid"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${e.name}`}
                        onClick={() => { if (confirm(`Remove ${e.name} from ${course?.title ?? "this course"}? This frees the seat.`)) { removeEnrolment(e.id); toast("Enrolment removed"); } }}
                        style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data.enrolments.length === 0 && data.courses.length === 0 && (
        <EmptyState
          title="Start with a course"
          body="Create a course, give it a session date, then enrol customers against it."
          action={<a href="/courses" className="btn btn-primary" style={{ display: "inline-block" }}>Go to Courses</a>}
        />
      )}
    </div>
  );
}
