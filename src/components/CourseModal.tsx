"use client";

import { useState } from "react";
import { paiseToRupees, rupeesToPaise } from "@/lib/format";
import { createCourse, updateCourse } from "@/lib/store";
import type { Course, CourseStatus } from "@/lib/types";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const STATUSES: { key: CourseStatus; label: string; sub: string }[] = [
  { key: "draft", label: "Draft", sub: "Hidden from learners" },
  { key: "live", label: "Live", sub: "Open for enrolment" },
  { key: "archived", label: "Archived", sub: "Retired, history kept" },
];

/** Create or edit a course. Passing `course` switches it to edit. */
export default function CourseModal({ course, onClose }: { course?: Course; onClose: () => void }) {
  const toast = useToast();
  const editing = Boolean(course);

  const [title, setTitle] = useState(course?.title ?? "");
  const [category, setCategory] = useState(course?.category ?? "");
  const [duration, setDuration] = useState(course?.duration ?? "");
  const [price, setPrice] = useState(course ? paiseToRupees(course.pricePaise) : "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [status, setStatus] = useState<CourseStatus>(course?.status ?? "draft");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Give the course a title.";
    if (!category.trim()) e.category = "A category groups it in the catalogue.";
    if (!duration.trim()) e.duration = "How long does it run?";

    const pricePaise = rupeesToPaise(price);
    if (pricePaise === null) e.price = "Enter the fee in rupees, e.g. 15000.";
    // A live course is sellable, so it must carry a real price.
    else if (pricePaise === 0 && status === "live") e.price = "A live course needs a fee above zero.";

    setErrors(e);
    if (Object.keys(e).length) return;

    const payload = {
      title: title.trim(),
      category: category.trim(),
      duration: duration.trim(),
      description: description.trim(),
      pricePaise: pricePaise as number,
      status,
    };

    if (course) {
      updateCourse(course.id, payload);
      toast("Course updated");
    } else {
      createCourse(payload);
      toast(status === "live" ? "Course created and published" : "Course created as a draft — add a session next");
    }
    onClose();
  };

  return (
    <Modal
      title={editing ? "Edit course" : "New course"}
      sub={editing ? course?.title : "Appears in the learner catalogue once it is live"}
      onClose={onClose}
      width={520}
    >
      <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 13 }}>
        <Field label="Course title" error={errors.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Certified POSH Trainer Programme" style={input} />
        </Field>

        <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Category" error={errors.category}>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="POSH · Train-the-Trainer" style={input} />
          </Field>
          <Field label="Duration" error={errors.duration}>
            <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="12 hours" style={input} />
          </Field>
        </div>

        <Field label="Fee (₹)" error={errors.price} hint="Stored in paise, so nothing rounds away">
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="15000" style={input} />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What learners will take away"
            style={{ ...input, resize: "vertical", lineHeight: 1.6 }}
          />
        </Field>

        <Field label="Status">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            {STATUSES.map((s) => {
              const on = status === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  style={{ cursor: "pointer", textAlign: "left", border: `1.5px solid ${on ? "#2fc4bc" : "var(--line)"}`, background: on ? "#eafaf8" : "#fff", borderRadius: 9, padding: "10px 11px" }}
                >
                  <div style={{ font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{s.label}</div>
                  <div style={{ font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{s.sub}</div>
                </button>
              );
            })}
          </div>
        </Field>

        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit}>{editing ? "Save changes" : "Create course"}</button>
        </ModalActions>
      </div>
    </Modal>
  );
}
