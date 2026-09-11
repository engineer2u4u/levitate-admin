"use client";

import { useState } from "react";
import { paiseToRupees, rupeesToPaise } from "@/lib/format";
import { createCourse, updateCourse } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import {
  CATEGORIES,
  IMAGE_SIZES,
  emptyModule,
  type Course,
  type CourseStatus,
  type Module,
} from "@/lib/types";
import ImageUpload from "./ImageUpload";
import ModuleEditor from "./ModuleEditor";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const STATUSES: { key: CourseStatus; label: string; sub: string }[] = [
  { key: "draft", label: "Draft", sub: "Hidden from learners" },
  { key: "live", label: "Live", sub: "Open for enrolment" },
  { key: "archived", label: "Archived", sub: "Retired, history kept" },
];

type Tab = "details" | "modules";

/** Create or edit a course. Passing `course` switches it to edit. */
export default function CourseModal({ course, onClose }: { course?: Course; onClose: () => void }) {
  const toast = useToast();
  const data = useAdminData();
  const editing = Boolean(course);

  const [tab, setTab] = useState<Tab>("details");
  // Null means "showing the list"; otherwise the module being edited. Kept as
  // an id rather than an object so edits always read from `modules`.
  const [openModule, setOpenModule] = useState<string | null>(null);

  const [title, setTitle] = useState(course?.title ?? "");
  const [category, setCategory] = useState(course?.category ?? "");
  const [duration, setDuration] = useState(course?.duration ?? "");
  const [tenure, setTenure] = useState(course?.tenure ?? "");
  const [facilitatorId, setFacilitatorId] = useState(course?.facilitatorId ?? "");
  const [liveCount, setLiveCount] = useState(course ? String(course.liveSessionCount) : "");
  const [liveSchedule, setLiveSchedule] = useState(course?.liveSessionSchedule ?? "");
  const [price, setPrice] = useState(course ? paiseToRupees(course.pricePaise) : "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [bannerUrl, setBannerUrl] = useState(course?.bannerUrl ?? "");
  const [modules, setModules] = useState<Module[]>(course?.modules ?? []);
  const [status, setStatus] = useState<CourseStatus>(course?.status ?? "draft");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setModule = (next: Module) => setModules((ms) => ms.map((m) => (m.id === next.id ? next : m)));

  const addModule = () => {
    const m = emptyModule();
    setModules((ms) => [...ms, m]);
    setOpenModule(m.id);
  };

  const moveModule = (from: number, to: number) => {
    if (to < 0 || to >= modules.length) return;
    setModules((ms) => {
      const next = [...ms];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Give the course a title.";
    if (!category.trim()) e.category = "Pick a category.";
    if (!duration.trim()) e.duration = "How much teaching time?";

    const pricePaise = rupeesToPaise(price);
    if (pricePaise === null) e.price = "Enter the fee in rupees, e.g. 15000.";
    // A live course is sellable, so it must carry a real price.
    else if (pricePaise === 0 && status === "live") e.price = "A live course needs a fee above zero.";

    // Only bite on publish. A draft is a work in progress by definition, and
    // refusing to save one would just lose the work.
    if (status === "live") {
      if (!bannerUrl) e.banner = "A live course needs a banner — it is the first thing learners see.";
      if (!facilitatorId) e.facilitator = "A live course needs a facilitator.";
      if (modules.length === 0) e.modules = "A live course needs at least one module.";
      else if (modules.some((m) => !m.title.trim())) e.modules = "Every module needs a title.";
    }

    setErrors(e);
    if (Object.keys(e).length) {
      // Send them to the tab that holds the problem, or the error is invisible.
      if (e.modules && !e.title && !e.category && !e.duration && !e.price && !e.banner && !e.facilitator) setTab("modules");
      else setTab("details");
      return;
    }

    const count = Number(liveCount.replace(/[^0-9]/g, ""));
    const payload = {
      title: title.trim(),
      category: category.trim(),
      duration: duration.trim(),
      tenure: tenure.trim(),
      facilitatorId,
      liveSessionCount: Number.isFinite(count) ? count : 0,
      liveSessionSchedule: liveSchedule.trim(),
      description: description.trim(),
      bannerUrl,
      modules,
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

  const current = modules.find((m) => m.id === openModule);
  const currentIndex = modules.findIndex((m) => m.id === openModule);
  const lessonTotal = modules.reduce((a, m) => a + m.lessons.length, 0);

  return (
    <Modal
      title={editing ? "Edit course" : "New course"}
      sub={editing ? course?.title : "Appears in the learner catalogue once it is live"}
      onClose={onClose}
      width={680}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <div style={{ display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: 999, padding: 5 }}>
          {([["details", "Details"], ["modules", `Modules${modules.length ? ` · ${modules.length}` : ""}`]] as const).map(([t, text]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{ flex: 1, cursor: "pointer", border: "none", borderRadius: 999, padding: "9px 12px", font: "700 12px 'Plus Jakarta Sans',sans-serif", color: tab === t ? "#fff" : "var(--muted)", background: tab === t ? "var(--grad)" : "transparent" }}
            >
              {text}
            </button>
          ))}
        </div>

        {tab === "details" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <ImageUpload
              label="Catalogue banner"
              value={bannerUrl}
              onChange={setBannerUrl}
              folder="banners"
              size={IMAGE_SIZES.banner}
            />
            {errors.banner && (
              <div role="alert" style={{ font: "600 10.5px 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", marginTop: -8 }}>{errors.banner}</div>
            )}

            <Field label="Course title" error={errors.title}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Certified POSH Trainer Programme" style={input} />
            </Field>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Category" error={errors.category}>
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
                  <option value="">Choose a category…</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  {/* An older course may carry a category since retired from the
                      list; keep it selectable so editing does not silently
                      change it. */}
                  {category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number]) && (
                    <option value={category}>{category}</option>
                  )}
                </select>
              </Field>
              <Field
                label="Facilitator"
                error={errors.facilitator}
                hint={data.facilitators.length === 0 ? "Add one under Facilitators first." : "A session may name someone else."}
              >
                <select value={facilitatorId} onChange={(e) => setFacilitatorId(e.target.value)} style={input}>
                  <option value="">
                    {data.facilitators.length === 0 ? "No facilitators yet…" : "Choose a facilitator…"}
                  </option>
                  {data.facilitators.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} — {f.title}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Teaching time" error={errors.duration} hint="Contact hours.">
                <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="12 hours" style={input} />
              </Field>
              <Field label="Tenure" hint="Calendar span it runs over.">
                <input value={tenure} onChange={(e) => setTenure(e.target.value)} placeholder="6 weeks" style={input} />
              </Field>
            </div>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Live sessions" hint="How many the fee includes.">
                <input
                  value={liveCount}
                  onChange={(e) => setLiveCount(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="4"
                  style={input}
                />
              </Field>
              <Field label="When they run" hint="Scheduled dates still live under Sessions.">
                <input value={liveSchedule} onChange={(e) => setLiveSchedule(e.target.value)} placeholder="Saturdays, 10:00–13:00 IST" style={input} />
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
          </div>
        ) : current ? (
          <ModuleEditor
            module={current}
            index={currentIndex}
            onChange={setModule}
            onBack={() => setOpenModule(null)}
            onDelete={() => {
              setModules((ms) => ms.filter((m) => m.id !== current.id));
              setOpenModule(null);
            }}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ font: "500 11px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
                {modules.length === 0
                  ? "No modules yet"
                  : `${modules.length} module${modules.length === 1 ? "" : "s"} · ${lessonTotal} lesson${lessonTotal === 1 ? "" : "s"}`}
              </div>
              <button type="button" className="btn btn-dark" onClick={addModule}>+ Add module</button>
            </div>

            {errors.modules && (
              <div role="alert" style={{ font: "600 11px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "9px 11px" }}>
                {errors.modules}
              </div>
            )}

            {modules.length === 0 ? (
              <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "26px 20px", textAlign: "center" }}>
                <div style={{ font: "700 13px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginBottom: 5 }}>Build the course out</div>
                <p style={{ font: "400 11.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", margin: "0 auto 14px", maxWidth: 340 }}>
                  A module groups the lessons learners work through — reading, video or downloads — and can end with a quiz.
                </p>
                <button type="button" className="btn btn-primary" onClick={addModule}>Add the first module</button>
              </div>
            ) : (
              modules.map((m, mi) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 11, border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button type="button" aria-label="Move up" onClick={() => moveModule(mi, mi - 1)} disabled={mi === 0} style={arrow}>▲</button>
                    <button type="button" aria-label="Move down" onClick={() => moveModule(mi, mi + 1)} disabled={mi === modules.length - 1} style={arrow}>▼</button>
                  </div>

                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="" style={{ width: 54, height: 32, flex: "none", objectFit: "cover", borderRadius: 6, background: "var(--surface)" }} />
                  ) : (
                    <div aria-hidden style={{ width: 54, height: 32, flex: "none", borderRadius: 6, background: "var(--surface)", border: "1px dashed var(--line)" }} />
                  )}

                  <button
                    type="button"
                    onClick={() => setOpenModule(m.id)}
                    style={{ flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer", border: "none", background: "none", padding: 0 }}
                  >
                    <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mi + 1}. {m.title || "Untitled module"}
                    </div>
                    <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
                      {m.lessons.length} lesson{m.lessons.length === 1 ? "" : "s"}
                      {m.quiz ? ` · quiz of ${m.quiz.questions.length}` : ""}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpenModule(m.id)}
                    style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)" }}
                  >
                    Edit
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit}>{editing ? "Save changes" : "Create course"}</button>
        </ModalActions>
      </div>
    </Modal>
  );
}

const arrow = {
  cursor: "pointer",
  border: "none",
  background: "none",
  padding: 0,
  lineHeight: 1,
  font: "700 7px 'Plus Jakarta Sans',sans-serif",
  color: "var(--muted)",
} as const;
