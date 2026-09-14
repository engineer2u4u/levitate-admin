"use client";

import { useState } from "react";
import { batchTaken, createBatch, sessionsOf, updateBatch } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { Batch } from "@/lib/types";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-07" → "November 2026", the usual way a batch is named. */
const monthName = (iso: string) => (iso ? `${MONTH_NAMES[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : "");

type Props = { batch?: Batch; courseId?: string; onClose: (created?: Batch) => void };

/**
 * Create or edit a batch — one run of a course.
 *
 * A new batch can copy the session schedule of an earlier one: the same
 * timings, topics and facilitator, every date moved so the first session falls
 * on the day chosen. Running a course again in November is then one form, not
 * six sessions typed out.
 */
export default function BatchModal({ batch, courseId, onClose }: Props) {
  const data = useAdminData();
  const toast = useToast();
  const editing = Boolean(batch);

  const courses = data.courses.filter((c) => c.status !== "archived" || c.id === batch?.courseId);

  const [course, setCourse] = useState(batch?.courseId ?? courseId ?? courses[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState(batch?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(batch?.endsOn ?? "");
  const [name, setName] = useState(batch?.name ?? "");
  const [nameTouched, setNameTouched] = useState(editing);
  const [seats, setSeats] = useState(String(batch?.seats ?? 30));
  const [enrolmentOpen, setEnrolmentOpen] = useState(batch?.enrolmentOpen ?? true);

  // Earlier batches of this course that have dated sessions to copy.
  const sources = data.batches
    .filter((b) => b.courseId === course && b.id !== batch?.id && sessionsOf(data, b.id).some((s) => s.startsOn))
    .reverse();
  const [copyFrom, setCopyFrom] = useState(editing ? "" : sources[0]?.id ?? "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const taken = batch ? batchTaken(data, batch.id) : 0;

  const pickStart = (iso: string) => {
    setStartsOn(iso);
    if (!nameTouched) setName(monthName(iso));
  };

  const pickCourse = (id: string) => {
    setCourse(id);
    const next = data.batches.filter((b) => b.courseId === id && sessionsOf(data, b.id).some((s) => s.startsOn));
    setCopyFrom(next[next.length - 1]?.id ?? "");
  };

  const submit = async () => {
    if (saving) return;
    const e: Record<string, string> = {};
    if (!course) e.course = "Pick the course this batch runs.";
    if (!name.trim()) e.name = "Name it the way the office refers to it, e.g. November 2026.";
    if (!startsOn) e.startsOn = "When does it start?";
    if (endsOn && startsOn && endsOn < startsOn) e.endsOn = "The end has to be on or after the start.";
    const seatCount = Number(seats);
    if (!Number.isInteger(seatCount) || seatCount < 1) e.seats = "A whole number, at least 1.";
    else if (seatCount < taken) e.seats = `${taken} already enrolled — seats cannot go below that.`;
    setErrors(e);
    if (Object.keys(e).length) return;

    // "2026-11", unless another batch of the course already has it — a second
    // run in the same month is allowed, it just goes without a code.
    const month = startsOn.slice(0, 7);
    const clash = data.batches.some((b) => b.courseId === course && b.id !== batch?.id && b.code === month);
    const values = {
      courseId: course,
      name: name.trim(),
      code: clash ? "" : month,
      startsOn,
      endsOn: endsOn || null,
      status: batch?.status ?? ("upcoming" as const),
      enrolmentOpen,
      seats: seatCount,
    };

    setSaving(true);
    if (batch) {
      const res = await updateBatch(batch.id, values);
      setSaving(false);
      if (!res.ok) return setErrors({ save: res.error });
      toast("Batch updated");
      onClose();
      return;
    }
    const res = await createBatch(values, copyFrom ? { fromBatchId: copyFrom, firstDay: startsOn } : undefined);
    setSaving(false);
    if (!res.ok) return setErrors({ save: res.error });
    const copied = copyFrom ? sessionsOf(data, copyFrom).filter((s) => s.startsOn).length : 0;
    toast(copied ? `Batch created with ${copied} session${copied === 1 ? "" : "s"} — add their Zoom links` : "Batch created — add its sessions next");
    onClose(res.batch);
  };

  const twoCol = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as const;
  const source = data.batches.find((b) => b.id === copyFrom);

  return (
    <Modal title={editing ? "Edit batch" : "New batch"} sub={editing ? batch?.name : "One run of a course, with its own dates and learners"} onClose={() => onClose()} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Field label="Course" error={errors.course}>
          <select value={course} onChange={(e) => pickCourse(e.target.value)} disabled={editing} style={{ ...input, cursor: editing ? "default" : "pointer" }}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>

        <div className="form-2col" style={twoCol}>
          <Field label="Starts" error={errors.startsOn}>
            <input type="date" value={startsOn} onChange={(e) => pickStart(e.target.value)} style={input} />
          </Field>
          <Field label="Ends" error={errors.endsOn} hint="Optional.">
            <input type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} style={input} />
          </Field>
        </div>

        <div className="form-2col" style={twoCol}>
          <Field label="Name" error={errors.name}>
            <input value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder="November 2026" style={input} />
          </Field>
          <Field label="Seats" error={errors.seats} hint={taken ? `${taken} already enrolled` : "Total capacity"}>
            <input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} style={input} />
          </Field>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", font: "600 11.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>
          <input type="checkbox" checked={enrolmentOpen} onChange={(e) => setEnrolmentOpen(e.target.checked)} style={{ marginTop: 3, accentColor: "#2fc4bc" }} />
          <span>
            Open for enrolment
            <span style={{ display: "block", font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>Untick to stop new enrolments without changing anything else.</span>
          </span>
        </label>

        {!editing && sources.length > 0 && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)" }}>
            <Field label="Copy sessions from" hint={source && startsOn ? "Same timings, topics and facilitator; every date moves so the first session is on the start date. Zoom links are not copied." : "Pick a start date to see where the copied sessions land."}>
              <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                <option value="">Don&rsquo;t copy — add sessions by hand</option>
                {sources.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} · {sessionsOf(data, b.id).filter((s) => s.startsOn).length} sessions</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {errors.save && (
          <div role="alert" style={{ font: "600 11px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "9px 11px" }}>
            {errors.save}
          </div>
        )}

        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={() => onClose()} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create batch"}
          </button>
        </ModalActions>
      </div>
    </Modal>
  );
}
