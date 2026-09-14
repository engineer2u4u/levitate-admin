"use client";

import { useState } from "react";
import { createSession, linkFor, sessionDateLabel, updateSession } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { Session, SessionStatus } from "@/lib/types";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const STATUSES: { key: SessionStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];

/** The clock time an ISO instant falls at in India, "18:00". */
function istTime(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** A day and a wall-clock time in India, as an instant. */
const istInstant = (day: string, time: string) => `${day}T${time}:00+05:30`;

const HTTPS = /^https:\/\/\S+$/i;

type Props = { session?: Session; courseId?: string; batchId?: string; onClose: () => void };

/**
 * Create or edit a live session. A session belongs to a batch — the run of the
 * course it is part of — and carries that run's Zoom link.
 *
 * The Zoom details are saved apart from the session: the public website reads
 * sessions to print dates, and a join link must never be public. Only staff
 * see them here, and (in a later phase) paid learners of the batch.
 */
export default function SessionModal({ session, courseId, batchId, onClose }: Props) {
  const data = useAdminData();
  const toast = useToast();
  const editing = Boolean(session);

  // Finished batches take no new sessions; the one being edited stays listed.
  const selectable = data.batches.filter(
    (b) => b.status === "upcoming" || b.status === "running" || b.id === session?.batchId,
  );
  const courses = data.courses.filter((c) => selectable.some((b) => b.courseId === c.id));
  const initialBatch =
    session?.batchId ?? batchId ?? selectable.find((b) => !courseId || b.courseId === courseId)?.id ?? "";

  const existingLink = session ? linkFor(data, session.id) : null;

  const [batch, setBatch] = useState(initialBatch);
  const [startsOn, setStartsOn] = useState(session?.startsOn ?? "");
  const [time, setTime] = useState(session?.time ?? "");
  const [topic, setTopic] = useState(session?.topic ?? "");
  // Not edited here any more, but kept: the masterclass stops taking payment at
  // its exact start, so a session that has one keeps it — moved to the new day
  // if the date changes. New sessions have none.
  const startTime = istTime(session?.startsAt ?? null);
  const endTime = istTime(session?.endsAt ?? null);
  const mode = session?.mode || "Live online · Zoom";
  const [trainer, setTrainer] = useState(session?.trainer ?? data.facilitators[0]?.name ?? "");
  // The facilitators on file, plus whoever an older session names if they are
  // not among them, so opening it does not quietly change who is shown.
  const trainers = [
    ...data.facilitators.map((f) => f.name),
    ...(session?.trainer && !data.facilitators.some((f) => f.name === session.trainer) ? [session.trainer] : []),
  ];
  const [status, setStatus] = useState<SessionStatus>(
    session?.status === "filling" || session?.status === "full" ? "open" : session?.status ?? "open",
  );
  const [joinUrl, setJoinUrl] = useState(existingLink?.joinUrl ?? "");
  const [meetingId, setMeetingId] = useState(existingLink?.meetingId ?? "");
  const [passcode, setPasscode] = useState(existingLink?.passcode ?? "");
  const [recordingUrl, setRecordingUrl] = useState(existingLink?.recordingUrl ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const chosen = data.batches.find((b) => b.id === batch);

  const submit = async () => {
    if (saving) return;
    const e: Record<string, string> = {};
    if (!chosen) e.batch = "Pick the batch this session is part of.";
    if (!startsOn) e.startsOn = "Pick the date it runs on.";
    if (!time.trim()) e.time = "Give the timing as it should read on the site.";
    if (!trainer.trim()) e.trainer = "Who is facilitating?";

    if (joinUrl.trim() && !HTTPS.test(joinUrl.trim())) e.joinUrl = "Paste the full Zoom link, starting https://";
    if (recordingUrl.trim() && !HTTPS.test(recordingUrl.trim())) e.recordingUrl = "Paste the full link, starting https://";

    setErrors(e);
    if (Object.keys(e).length || !chosen) return;

    const payload = {
      courseId: chosen.courseId,
      batchId: chosen.id,
      startsOn,
      date: sessionDateLabel(startsOn),
      time: time.trim(),
      topic: topic.trim(),
      startsAt: startTime ? istInstant(startsOn, startTime) : null,
      endsAt: startTime && endTime ? istInstant(startsOn, endTime) : null,
      mode,
      trainer: trainer.trim(),
      // Capacity is the batch's; the column is kept in step with it.
      seats: chosen.seats,
      status,
    };
    const link = { joinUrl, meetingId, passcode, recordingUrl };

    setSaving(true);
    const res = session ? await updateSession(session.id, payload, link) : await createSession(payload, link);
    setSaving(false);
    if (!res.ok) {
      setErrors({ save: res.error });
      return;
    }
    toast(session ? "Session updated" : status === "draft" ? "Session saved as a draft" : "Session added");
    onClose();
  };

  const twoCol = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as const;

  return (
    <Modal
      title={editing ? "Edit session" : "New session"}
      sub={chosen ? `${data.courses.find((c) => c.id === chosen.courseId)?.short || ""} · ${chosen.name}` : "A live session in a batch"}
      onClose={onClose}
      width={580}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {selectable.length === 0 ? (
          <div style={{ font: "500 12.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--body)", background: "#fdf4e3", border: "1px solid #f0dcae", borderRadius: 10, padding: "14px 16px" }}>
            Create a batch first under Batches — a session belongs to one run of a course.
          </div>
        ) : (
          <>
            {/* Opened from a batch — or editing a session, which already has
                one — the batch is known and shown in the title, so there is
                nothing to choose. The picker stays only for a caller without. */}
            {!batchId && !session && (
              <Field label="Batch" error={errors.batch}>
                <select value={batch} onChange={(e) => setBatch(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                  <option value="" disabled>Choose a batch…</option>
                  {courses.map((c) => (
                    <optgroup key={c.id} label={c.short || c.title}>
                      {selectable.filter((b) => b.courseId === c.id).map((b) => (
                        <option key={b.id} value={b.id}>{b.name}{b.status === "running" ? " (running)" : ""}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            )}

            <div className="form-2col" style={twoCol}>
              <Field
                label="Date"
                error={errors.startsOn}
                hint={startsOn ? `The site prints "${sessionDateLabel(startsOn)}"` : "The site formats it for each place it appears."}
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

            <Field
              label="Facilitator"
              error={errors.trainer}
              hint={trainers.length === 0 ? "Add facilitators under Facilitators first." : undefined}
            >
              <select value={trainer} onChange={(e) => setTrainer(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                <option value="" disabled>Choose a facilitator…</option>
                {trainers.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </Field>

            <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 13, display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ font: "500 11px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
                <strong style={{ color: "var(--ink)" }}>Zoom.</strong> Kept private — never shown on the public website.
              </div>
              <Field label="Join link" error={errors.joinUrl}>
                <input value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} placeholder="https://us06web.zoom.us/j/…" style={input} />
              </Field>
              <div className="form-2col" style={twoCol}>
                <Field label="Meeting ID" hint="Optional.">
                  <input value={meetingId} onChange={(e) => setMeetingId(e.target.value)} placeholder="812 3456 7890" style={input} />
                </Field>
                <Field label="Passcode" hint="Optional.">
                  <input value={passcode} onChange={(e) => setPasscode(e.target.value)} style={input} />
                </Field>
              </div>
              <Field label="Recording link" error={errors.recordingUrl} hint="Add after the session, for anyone who missed it.">
                <input value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="https://…" style={input} />
              </Field>
            </div>

            <Field label="Status" hint="Completing the batch closes all its sessions.">
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

            {errors.save && (
              <div role="alert" style={{ font: "600 11px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "9px 11px" }}>
                {errors.save}
              </div>
            )}

            <ModalActions>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add session"}
              </button>
            </ModalActions>
          </>
        )}
      </div>
    </Modal>
  );
}