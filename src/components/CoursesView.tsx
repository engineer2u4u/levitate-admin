"use client";

import Link from "next/link";
import { useState } from "react";
import { updateCourse } from "@/lib/store";
import { useAdminData, useCatalogStatus } from "@/lib/useStore";
import { batchCardFor, type Course } from "@/lib/types";
import BatchModal from "./BatchModal";
import CatalogState from "./CatalogState";
import { EmptyState, card } from "./ui";
import { useToast } from "./AdminShell";
import { useCanWrite } from "./AuthGate";

/** "2026-10-03" → "3 Oct 2026", read from its parts so no time zone can shift the day. */
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

export default function CoursesView() {
  const data = useAdminData();
  const status = useCatalogStatus();
  const toast = useToast();
  const canWrite = useCanWrite();
  const [batchFor, setBatchFor] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  /**
   * Live: published, and the website offers enrolment and takes payment for
   * its open batch. Paused: still on the website, but with an enquiry button
   * instead, and the payment server refuses to take money for it.
   *
   * Either way the course stays published — pausing is "not taking bookings
   * right now", not "take it down". The Upcoming Batches card follows, since
   * its status and button come from the same switch.
   */
  const setLive = async (c: Course, live: boolean) => {
    // A fee "on request" has nothing to pay, so the site keeps its enquiry
    // button whatever this says — better to say so than let it look broken.
    const payable = !c.priceOnRequest && c.pricePaise > 0;
    if (
      live &&
      !confirm(
        payable
          ? `Put ${c.title} live? The website will show "Enrol · Pay securely" and take real payments for its open batch.`
          : `${c.title} has its fee set to "on request", so the website will keep showing an enquiry button even when live. Put it live anyway?`,
      )
    ) return;
    const siteStatus = live ? "enrolling" : "waitlist";
    setSwitching(c.id);
    const res = await updateCourse(c.id, {
      status: "live",
      siteStatus,
      batch: batchCardFor({ ...c, status: "live", siteStatus }),
    });
    setSwitching(null);
    toast(res.ok ? (live ? `${c.short || c.title} is live — open for enrolment` : `${c.short || c.title} paused — enquiries only`) : res.error);
  };

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
          {data.courses.length} course{data.courses.length === 1 ? "" : "s"}
        </div>
      </div>

      {data.courses.length === 0 && status.state !== "ready" ? (
        <CatalogState status={status} what="courses" />
      ) : data.courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          body="The catalogue is the website's, added to the database rather than typed in here. Once a course is in it, its batches are run from this screen."
        />
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          {data.courses.map((c) => {
            // Just the course, how many runs it has had, and when the next one
            // starts; everything else is one click away under Batches.
            const batches = data.batches.filter((b) => b.courseId === c.id && b.status !== "cancelled");
            const next = batches
              .filter((b) => (b.status === "upcoming" || b.status === "running") && b.startsOn)
              .sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? ""))[0];
            return (
            <div
              key={c.id}
              className="row-hover"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "13px 18px", borderBottom: "1px solid var(--surface)" }}
            >
              <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                <div style={{ font: "700 13px/1.35 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{c.title}</div>
                <div style={{ font: "500 11px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 3 }}>
                  {batches.length} batch{batches.length === 1 ? "" : "es"}
                  {" · "}
                  {next?.startsOn ? `Next starts ${longDate(next.startsOn)}` : "No upcoming batch"}
                </div>
              </div>
              {canWrite && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-soft" onClick={() => setBatchFor(c.id)}>+ New batch</button>
                  <Link href={`/batches/?course=${c.slug}`} className="btn btn-ghost" style={{ textDecoration: "none" }}>Batches</Link>
                  <LiveSwitch
                    live={c.status === "live" && c.siteStatus === "enrolling"}
                    busy={switching === c.id}
                    onChange={(live) => void setLive(c, live)}
                  />
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {batchFor && <BatchModal courseId={batchFor} onClose={() => setBatchFor(null)} />}
    </div>
  );
}

/** An on/off switch labelled with what the website is doing now. */
function LiveSwitch({ live, busy, onChange }: { live: boolean; busy: boolean; onChange: (live: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={live}
      disabled={busy}
      onClick={() => onChange(!live)}
      title={live ? "Live: open for enrolment. Click to pause (enquiries only)." : "Paused: enquiries only. Click to go live."}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: busy ? "wait" : "pointer", border: "none", background: "none", padding: "4px 2px", opacity: busy ? 0.6 : 1 }}
    >
      <span
        aria-hidden
        style={{ position: "relative", width: 34, height: 19, borderRadius: 999, background: live ? "#2fc4bc" : "#c9d6e0", transition: "background .15s ease", flex: "none" }}
      >
        <span style={{ position: "absolute", top: 2, left: live ? 17 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(10,27,51,.25)", transition: "left .15s ease" }} />
      </span>
      <span style={{ font: "700 11px 'Plus Jakarta Sans',sans-serif", color: live ? "#136f6a" : "var(--muted)", minWidth: 42, textAlign: "left" }}>
        {live ? "Live" : "Paused"}
      </span>
    </button>
  );
}
