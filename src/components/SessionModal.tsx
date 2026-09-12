"use client";

import { useState } from "react";
import { createSession, seatsTaken, updateSession } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { Session, SessionStatus } from "@/lib/types";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const STATUSES: { key: SessionStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-10-03" → "Sat 3 Oct 2026", the label the website and this admin print.
 *
 * Built from the date's own parts rather than through `new Date(iso)`, which
 * is midnight UTC and prints as the day before anywhere west of it.
 */
function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** The clock time an ISO instant falls at in India, "18:00". */
function istTime(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** A day and a wall-clock time in India, as an instant. */
const istInstant = (day: string, time: string) => `${day}T${time}:00+05:30`;

type Props = { session?: Session; courseId?: string; onClose: () => void };

/** Create or edit a scheduled session. `courseId` preselects the course. */
export default function SessionModal({ session, courseId, onClose }: Props) {
  const data = useAdminData();
  const toast = useToast();
  const editing = Boolean(session);

  // Archived courses cannot take new dates.
  const selectable = data.courses.filter((c) => c.status !== "archived");

  const [course, setCourse] = useState(session?.courseId ?? courseId ?? selectable[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState(session?.startsOn ?? "");
  const [time, setTime] = useState(session?.time ?? "");
  const [topic, setTopic] = useState(session?.topic ?? "");
  const [startTime, setStartTime] = useState(istTime(session?.startsAt ?? null));
  const [endTime, setEndTime] = useState(istTime(session?.endsAt ?? null));
  const [mode, setMode] = useState(session?.mode ?? "Online · Zoom");
  const [trainer, setTrainer] = useState(session?.trainer ?? "");
  const [seats, setSeats] = useState(String(session?.seats ?? 20));
  const [status, setStatus] = useState<SessionStatus>(
    session?.status === "filling" || session?.status === "full" ? "open" : session?.status ?? "open",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Seats already sold set the floor on how far capacity can be reduced.
  const taken = session ? seatsTaken(data, session.id) : 0;

  const submit = async () => {
    if (saving) return;
    const e: Record<string, string> = {};
    if (!course) e.course = "Pick the course this session belongs to.";
    if (!startsOn) e.startsOn = "Pick the date it runs on.";
    if (!time.trim()) e.time = "Give the timing as it should read on the site.";
    if (!mode.trim()) e.mode = "Online or onsite, and where.";
    if (!trainer.trim()) e.trainer = "Who is facilitating?";

    // The exact times are optional, and only meaningful together.
    if (endTime && !startTime) e.startTime = "Give the start time too, or clear the end time.";
    if (startTime && endTime && endTime <= startTime) e.endTime = "The end time has to be after the start time.";

    const seatCount = Number(seats);
    if (!Number.isInteger(seatCount) || seatCount < 1) e.seats = "Seats must be a whole number, at least 1.";
    else if (seatCount < taken) e.seats = `${taken} seat${taken === 1 ? " is" : "s are"} already taken — capacity cannot go below that.`;

    setErrors(e);
    if (Object.keys(e).length) return;

    const payload = {
      courseId: course,
      startsOn,
      date: dateLabel(startsOn),
      time: time.trim(),
      topic: topic.trim(),
      startsAt: startTime ? istInstant(startsOn, startTime) : null,
      endsAt: startTime && endTime ? istInstant(startsOn, endTime) : null,
      mode: mode.trim(),
      trainer: trainer.trim(),
      seats: seatCount,
      status,
    };

    setSaving(true);
    const res = session ? await updateSession(session.id, payload) : await createSession(payload);
    setSaving(false);
    if (!res.ok) {
      setErrors({ save: res.error });
      return;
    }
    toast(session ? "Session updated" : status === "draft" ? "Session saved as a draft" : "Session published");
    onClose();
  };

  return (
    <Modal
      title={editing ? "Edit session" : "New session"}
      sub={editing ? `${(startsOn && dateLabel(startsOn)) || "Session"} · ${mode}` : "A scheduled date for an existing course"}
      onClose={onClose}
      width={560}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {selectable.length === 0 ? (
          <div style={{ font: "500 12.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--body)", background: "#fdf4e3", border: "1px solid #f0dcae", borderRadius: 10, padding: "14px 16px" }}>
            Create a course first — a session has to belong to one.
          </div>
        ) : (
          <>
            <Field label="Course" error={errors.course}>
              <select value={course} onChange={(e) => setCourse(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                {selectable.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}{c.status === "draft" ? " (draft)" : ""}</option>
                ))}
              </select>
            </Field>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field
                label="Date"
                error={errors.startsOn}
                hint={startsOn ? `The site prints "${dateLabel(startsOn)}"` : "The site formats it for each place it appears."}
              >
                <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={input} />
              </Field>
              <Field label="Timing" error={errors.time} hint="Printed as written.">
                <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="6:00 – 8:00 PM" style={input} />
              </Field>
            </div>

            <Field label="Topic" hint="Shown to learners against this session. Optional.">
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Foundations & the CLEAR framework" style={input} />
            </Field>

            {/* The minute only matters where something turns on it: a paid
                one-off stops taking registrations when it starts. */}
            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Exact start (IST)" error={errors.startTime} hint="Optional. Registration closes at this moment.">
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={input} />
              </Field>
              <Field label="Exact end (IST)" error={errors.endTime} hint="Optional.">
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={input} />
              </Field>
            </div>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Mode & venue" error={errors.mode}>
                <input value={mode} onChange={(e) => setMode(e.target.value)} placeholder="Online · Zoom" style={input} />
              </Field>
              <Field label="Facilitator" error={errors.trainer}>
                <input value={trainer} onChange={(e) => setTrainer(e.target.value)} placeholder="Parichita Kotnala" style={input} />
              </Field>
            </div>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Seats" error={errors.seats} hint={taken > 0 ? `${taken} already enrolled` : "Total capacity"}>
                <input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} style={input} />
              </Field>
              <Field label="Status" hint="Full and Filling are worked out from bookings">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6 }}>
                  {STATUSES.map((s) => {
                    const on = status === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setStatus(s.key)}
                        style={{ cursor: "pointer", border: `1.5px solid ${on ? "#2fc4bc" : "var(--line)"}`, background: on ? "#eafaf8" : "#fff", borderRadius: 9, padding: "9px 6px", font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            {errors.save && (
              <div role="alert" style={{ font: "600 11px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "9px 11px" }}>
                {errors.save}
              </div>
            )}

            <ModalActions>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Publish session"}
              </button>
            </ModalActions>
          </>
        )}
      </div>
    </Modal>
  );
}
