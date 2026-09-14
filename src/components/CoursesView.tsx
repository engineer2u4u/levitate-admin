"use client";

import { useState } from "react";
import { inr } from "@/lib/format";
import { removeCourse } from "@/lib/store";
import { useAdminData, useCatalogStatus } from "@/lib/useStore";
import type { Course } from "@/lib/types";
import CatalogState from "./CatalogState";
import CourseModal from "./CourseModal";
import SessionModal from "./SessionModal";
import { EmptyState, Pill, card } from "./ui";
import { useToast } from "./AdminShell";
import { useCanWrite } from "./AuthGate";

export default function CoursesView() {
  const data = useAdminData();
  const status = useCatalogStatus();
  const toast = useToast();
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<Course | null>(null);
  const [sessionFor, setSessionFor] = useState<string | null>(null);

  const tone = (s: Course["status"]) => (s === "live" ? "good" : s === "draft" ? "neutral" : "bad");

  const onDelete = async (c: Course) => {
    const enrolled = data.enrolments.filter((e) => e.courseId === c.id).length;
    const message = enrolled
      ? `${c.title} has ${enrolled} enrolment${enrolled === 1 ? "" : "s"}. It will be archived rather than deleted, so those records stay intact. Continue?`
      : `Delete ${c.title}? Its ${data.sessions.filter((s) => s.courseId === c.id).length} session(s) go too. This cannot be undone.`;
    if (!confirm(message)) return;
    const res = await removeCourse(c.id);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    toast(res.archived ? "Course archived — enrolment history kept" : "Course deleted");
  };

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
          {data.courses.length} course{data.courses.length === 1 ? "" : "s"} · {data.sessions.length} scheduled session{data.sessions.length === 1 ? "" : "s"}
        </div>
      </div>

      {data.courses.length === 0 && status.state !== "ready" ? (
        <CatalogState status={status} what="courses" />
      ) : data.courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          body="The catalogue is the website's, added to the database rather than typed in here. Once a course is in it, this screen edits its start, syllabus, status and brochure."
        />
      ) : (
        <div className="course-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
          {data.courses.map((c) => {
            const sessions = data.sessions.filter((s) => s.courseId === c.id);
            const enrolled = data.enrolments.filter((e) => e.courseId === c.id).reduce((a, e) => a + e.seats, 0);
            const revenue = data.enrolments.filter((e) => e.courseId === c.id && e.paid).reduce((a, e) => a + e.amountPaise, 0);
            const lead = data.facilitators.find((f) => f.id === c.facilitatorId);
            return (
              <div key={c.id} style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {c.bannerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.bannerUrl} alt="" style={{ display: "block", width: "100%", aspectRatio: "8 / 3", objectFit: "cover", background: "var(--surface)" }} />
                )}
                <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)", letterSpacing: ".11em", textTransform: "uppercase" }}>{c.category}</div>
                    <div style={{ font: "700 15px/1.25 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginTop: 5 }}>{c.title}</div>
                  </div>
                  <Pill tone={tone(c.status)}>{c.status}</Pill>
                </div>

                {c.description && (
                  <div style={{ font: "400 11.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>{c.description}</div>
                )}

                {/* The offering at a glance — what the fee buys and who leads it,
                    separate from the tiles below which are counts. */}
                <div style={{ font: "600 10.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--body)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span>{sessions.length} scheduled</span>
                  {c.liveSessionCount > 0 && <span style={{ color: "var(--muted)" }}>·</span>}
                  {c.liveSessionCount > 0 && <span>{c.liveSessionCount} live session{c.liveSessionCount === 1 ? "" : "s"} included</span>}
                  {lead && <span style={{ color: "var(--muted)" }}>·</span>}
                  {lead && <span>{lead.name}</span>}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, borderTop: "1px solid var(--line-soft)", paddingTop: 11 }}>
                  {[
                    { k: "Fee", v: inr(c.pricePaise) },
                    { k: "Tenure", v: c.tenure || c.duration },
                    { k: "Modules", v: String(c.modules.length) },
                    { k: "Enrolled", v: String(enrolled) },
                  ].map((s) => (
                    <div key={s.k}>
                      <div style={{ font: "700 9px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".09em", textTransform: "uppercase" }}>{s.k}</div>
                      <div style={{ font: "700 13px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginTop: 3 }}>{s.v}</div>
                    </div>
                  ))}
                </div>

                {revenue > 0 && (
                  <div style={{ font: "600 10.5px 'Plus Jakarta Sans',sans-serif", color: "#136f6a" }}>{inr(revenue)} collected</div>
                )}

                {canWrite && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-soft" onClick={() => setSessionFor(c.id)}>+ Add session</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing(c)}>Edit course</button>
                    <button
                      type="button"
                      onClick={() => void onDelete(c)}
                      style={{ cursor: "pointer", border: "none", background: "none", font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", padding: "0 4px" }}
                    >
                      {data.enrolments.some((e) => e.courseId === c.id) ? "Archive" : "Delete"}
                    </button>
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <CourseModal course={editing} onClose={() => setEditing(null)} />}
      {sessionFor && <SessionModal courseId={sessionFor} onClose={() => setSessionFor(null)} />}
    </div>
  );
}
