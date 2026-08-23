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

type Props = { session?: Session; courseId?: string; onClose: () => void };

/** Create or edit a scheduled session. `courseId` preselects the course. */
export default function SessionModal({ session, courseId, onClose }: Props) {
  const data = useAdminData();
  const toast = useToast();
  const editing = Boolean(session);

  // Archived courses cannot take new dates.
  const selectable = data.courses.filter((c) => c.status !== "archived");

  const [course, setCourse] = useState(session?.courseId ?? courseId ?? selectable[0]?.id ?? "");
  const [date, setDate] = useState(session?.date ?? "");
  const [time, setTime] = useState(session?.time ?? "");
  const [mode, setMode] = useState(session?.mode ?? "Online · Zoom");
  const [trainer, setTrainer] = useState(session?.trainer ?? "");
  const [seats, setSeats] = useState(String(session?.seats ?? 20));
  const [status, setStatus] = useState<SessionStatus>(
    session?.status === "filling" || session?.status === "full" ? "open" : session?.status ?? "open",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Seats already sold set the floor on how far capacity can be reduced.
  const taken = session ? seatsTaken(data, session.id) : 0;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!course) e.course = "Pick the course this session belongs to.";
    if (!date.trim()) e.date = "Give the date.";
    if (!time.trim()) e.time = "Give the timing.";
    if (!mode.trim()) e.mode = "Online or onsite, and where.";
    if (!trainer.trim()) e.trainer = "Who is facilitating?";

    const seatCount = Number(seats);
    if (!Number.isInteger(seatCount) || seatCount < 1) e.seats = "Seats must be a whole number, at least 1.";
    else if (seatCount < taken) e.seats = `${taken} seat${taken === 1 ? " is" : "s are"} already taken — capacity cannot go below that.`;

    setErrors(e);
    if (Object.keys(e).length) return;

    const payload = {
      courseId: course,
      date: date.trim(),
      time: time.trim(),
      mode: mode.trim(),
      trainer: trainer.trim(),
      seats: seatCount,
      status,
    };

    if (session) {
      updateSession(session.id, payload);
      toast("Session updated");
    } else {
      createSession(payload);
      toast(status === "draft" ? "Session saved as a draft" : "Session published");
    }
    onClose();
  };

  return (
    <Modal
      title={editing ? "Edit session" : "New session"}
      sub={editing ? `${date || "Session"} · ${mode}` : "A scheduled date for an existing course"}
      onClose={onClose}
      width={520}
    >
      <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 13 }}>
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
              <Field label="Date" error={errors.date}>
                <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="26 Sep 2026" style={input} />
              </Field>
              <Field label="Time" error={errors.time}>
                <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="6:00 – 8:00 PM IST" style={input} />
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

            <ModalActions>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit}>{editing ? "Save changes" : "Publish session"}</button>
            </ModalActions>
          </>
        )}
      </div>
    </Modal>
  );
}
