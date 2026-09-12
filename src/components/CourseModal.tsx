"use client";

import { useState } from "react";
import { paiseToRupees, rupeesToPaise } from "@/lib/format";
import { createCourse, nextSlug, updateCourse } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import {
  CATEGORIES,
  IMAGE_SIZES,
  emptyBatch,
  emptyModule,
  type BatchRow,
  type Course,
  type CourseBatch,
  type CourseInput,
  type CourseStatus,
  type Module,
  type SiteStatus,
} from "@/lib/types";
import ImageUpload from "./ImageUpload";
import ModuleEditor from "./ModuleEditor";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const STATUSES: { key: CourseStatus; label: string; sub: string }[] = [
  { key: "draft", label: "Draft", sub: "Not on the website" },
  { key: "live", label: "Live", sub: "Published on the website" },
  { key: "archived", label: "Archived", sub: "Retired, history kept" },
];

/** What a published course offers — separate from `status`, which decides
 *  whether it is published at all. */
const SITE_STATUSES: { key: SiteStatus; label: string; sub: string }[] = [
  { key: "enrolling", label: "Enrolling", sub: "Taking bookings now" },
  { key: "waitlist", label: "Waitlist", sub: "Collecting interest until dates are set" },
];

/** Filled in by the website from the first open session and the fee. */
const PLACEHOLDERS = "Placeholders: {starts} → 3 October · {starts_short} → 3 Oct · {fee} → ₹32,000";

type Tab = "details" | "modules" | "website";

// The fields each tab holds, so a refused save opens the tab with the problem.
const DETAILS_FIELDS = ["title", "category", "duration", "price"];
const WEBSITE_FIELDS = ["listPrice", "sortOrder"];

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
  // The website's own rows name a facilitator without pointing at a record —
  // those live in this browser, so the database cannot. Match the name, so the
  // picker shows who the site already prints.
  const [facilitatorId, setFacilitatorId] = useState(() => {
    if (!course || data.facilitators.some((f) => f.id === course.facilitatorId)) return course?.facilitatorId ?? "";
    const name = course.facilitatorName.trim().toLowerCase();
    return data.facilitators.find((f) => f.name.trim().toLowerCase() === name)?.id ?? course.facilitatorId;
  });
  const [liveCount, setLiveCount] = useState(course ? String(course.liveSessionCount) : "");
  const [liveSchedule, setLiveSchedule] = useState(course?.liveSessionSchedule ?? "");
  // A fee on request is held as zero; show that as blank, not as "0".
  const [price, setPrice] = useState(course && !(course.priceOnRequest && course.pricePaise === 0) ? paiseToRupees(course.pricePaise) : "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [bannerUrl, setBannerUrl] = useState(course?.bannerUrl ?? "");
  const [modules, setModules] = useState<Module[]>(course?.modules ?? []);
  const [status, setStatus] = useState<CourseStatus>(course?.status ?? "draft");

  /* website */
  const [short, setShort] = useState(course?.short ?? "");
  const [tag, setTag] = useState(course?.tag ?? "");
  const [mode, setMode] = useState(course?.mode ?? "");
  const [siteStatus, setSiteStatus] = useState<SiteStatus>(course?.siteStatus ?? "waitlist");
  const [hidden, setHidden] = useState(course?.hidden ?? false);
  const [priceOnRequest, setPriceOnRequest] = useState(course?.priceOnRequest ?? false);
  const [priceNote, setPriceNote] = useState(course?.priceNote ?? "");
  const [listPrice, setListPrice] = useState(course?.listPricePaise != null ? paiseToRupees(course.listPricePaise) : "");
  const [modulesLabel, setModulesLabel] = useState(course?.modulesLabel ?? "");
  const [hoursLabel, setHoursLabel] = useState(course?.hoursLabel ?? "");
  const [image, setImage] = useState(course?.image ?? "");
  // A new course goes after the listed ones, not ahead of the flagship.
  const [sortOrder, setSortOrder] = useState(() =>
    String(course?.sortOrder ?? Math.max(0, ...data.courses.filter((c) => !c.hidden).map((c) => c.sortOrder)) + 1),
  );
  const [startsLabel, setStartsLabel] = useState(course?.startsLabel ?? "");
  const [batch, setBatch] = useState<CourseBatch>(() => course?.batch ?? emptyBatch());

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const chosen = data.facilitators.find((f) => f.id === facilitatorId);

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

  const setBatchField = <K extends keyof CourseBatch>(key: K, value: CourseBatch[K]) =>
    setBatch((b) => ({ ...b, [key]: value }));

  const setRow = (i: number, next: BatchRow) =>
    setBatch((b) => ({ ...b, rows: b.rows.map((r, j) => (j === i ? next : r)) }));

  const moveRow = (from: number, to: number) => {
    if (to < 0 || to >= batch.rows.length) return;
    setBatch((b) => {
      const rows = [...b.rows];
      const [item] = rows.splice(from, 1);
      rows.splice(to, 0, item);
      return { ...b, rows };
    });
  };

  const submit = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Give the course a title.";
    if (!category.trim()) e.category = "Pick a category.";
    if (!duration.trim()) e.duration = "How much teaching time?";

    // A fee on request is not being sold yet, so none is needed — though one
    // typed in anyway is kept.
    const pricePaise = priceOnRequest && !price.trim() ? 0 : rupeesToPaise(price);
    if (pricePaise === null) e.price = "Enter the fee in rupees, e.g. 15000.";
    // A live course is sellable, so it must carry a real price.
    else if (pricePaise === 0 && status === "live" && !priceOnRequest) {
      e.price = "A live course needs a fee above zero — or tick Fee on request under Website.";
    }

    const listPricePaise = listPrice.trim() ? rupeesToPaise(listPrice) : null;
    if (listPrice.trim() && listPricePaise === null) e.listPrice = "Enter the standard fee in rupees, or leave it blank.";

    const order = Number(sortOrder);
    if (!sortOrder.trim() || !Number.isInteger(order)) e.sortOrder = "A whole number — lower comes first.";

    // The website's learning content lives in its own code, so a live course
    // no longer needs a banner, modules or a facilitator here. Modules that do
    // exist still need their titles.
    if (status === "live" && modules.some((m) => !m.title.trim())) e.modules = "Every module needs a title.";

    setErrors(e);
    if (Object.keys(e).length) {
      // Send them to the tab that holds the problem, or the error is invisible.
      if (DETAILS_FIELDS.some((k) => e[k])) setTab("details");
      else if (WEBSITE_FIELDS.some((k) => e[k])) setTab("website");
      else setTab("modules");
      return;
    }

    const count = Number(liveCount.replace(/[^0-9]/g, ""));
    const payload: CourseInput = {
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
      short: short.trim(),
      tag: tag.trim(),
      mode: mode.trim(),
      siteStatus,
      hidden,
      priceOnRequest,
      priceNote: priceNote.trim(),
      listPricePaise,
      modulesLabel: modulesLabel.trim(),
      hoursLabel: hoursLabel.trim(),
      // Copied, because the website cannot read this browser's facilitators.
      // With nobody picked, the name the site already prints is kept.
      facilitatorName: chosen?.name ?? course?.facilitatorName ?? "",
      image: image.trim(),
      sortOrder: order,
      startsLabel: startsLabel.trim(),
      batch: {
        show: batch.show,
        tag: batch.tag.trim(),
        title: batch.title.trim(),
        short: batch.short.trim(),
        statusLabel: batch.statusLabel.trim(),
        rows: batch.rows.map((r) => ({ k: r.k.trim(), v: r.v.trim() })).filter((r) => r.k || r.v),
        feeNote: batch.feeNote.trim(),
        cta: batch.cta.trim(),
      },
    };

    setBusy(true);
    const res = course ? await updateCourse(course.id, payload) : await createCourse(payload);
    setBusy(false);
    if (!res.ok) {
      // Kept open, so nothing typed is lost; the list behind has rolled back.
      setErrors({ save: res.error });
      toast(res.error);
      return;
    }
    if (course) toast("Course updated");
    else toast(status === "live" ? "Course created and published" : "Course created as a draft — add a session next");
    onClose();
  };

  const current = modules.find((m) => m.id === openModule);
  const currentIndex = modules.findIndex((m) => m.id === openModule);
  const lessonTotal = modules.reduce((a, m) => a + m.lessons.length, 0);

  const tabs: [Tab, string][] = [
    ["details", "Details"],
    ["modules", `Modules${modules.length ? ` · ${modules.length}` : ""}`],
    ["website", "Website"],
  ];

  return (
    <Modal
      title={editing ? "Edit course" : "New course"}
      sub={editing ? course?.title : "Appears on the website once it is live"}
      onClose={onClose}
      width={680}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <div style={{ display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: 999, padding: 5 }}>
          {tabs.map(([t, text]) => (
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

            <Field label="Course title" error={errors.title}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. PoSH & Workplace Dignity Facilitator Program" style={input} />
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
                hint={
                  data.facilitators.length === 0
                    ? "Add one under Facilitators first."
                    : !chosen && course?.facilitatorName
                      ? `The website prints ${course.facilitatorName}.`
                      : "A session may name someone else."
                }
              >
                <select value={facilitatorId} onChange={(e) => setFacilitatorId(e.target.value)} style={input}>
                  <option value="">
                    {data.facilitators.length === 0 ? "No facilitators yet…" : "Choose a facilitator…"}
                  </option>
                  {data.facilitators.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} — {f.title}</option>
                  ))}
                  {/* Saved from another browser, whose facilitators this one
                      does not have. Kept, so saving here does not drop it. */}
                  {facilitatorId && !chosen && (
                    <option value={facilitatorId}>{course?.facilitatorName || "Someone not in this browser"}</option>
                  )}
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

            <Field
              label="Fee (₹)"
              error={errors.price}
              hint={priceOnRequest ? "Optional — Fee on request is ticked under Website." : "Stored in paise, so nothing rounds away"}
            >
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
                {STATUSES.map((s) => (
                  <button key={s.key} type="button" onClick={() => setStatus(s.key)} style={choice(status === s.key)}>
                    <div style={{ font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{s.label}</div>
                    <div style={{ font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{s.sub}</div>
                  </button>
                ))}
              </div>
            </Field>
          </div>
        ) : tab === "website" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <Field
              label="Web address"
              hint={editing
                ? "Fixed once created — the website, its sitemap and every shared link use it."
                : "Made from the title when the course is created. It cannot change afterwards."}
            >
              <div style={{ ...input, background: "#f8fafc", color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {course?.slug ?? (title.trim() ? nextSlug(title) : "—")}
              </div>
            </Field>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Short name" hint="Used in the nav, cards and bars.">
                <input value={short} onChange={(e) => setShort(e.target.value)} placeholder="PoSH Train-the-Trainer" style={input} />
              </Field>
              <Field label="Card tag" hint="The small label on its catalogue card.">
                <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Enrolling" style={input} />
              </Field>
            </div>

            <Field label="Mode" hint={PLACEHOLDERS}>
              <input value={mode} onChange={(e) => setMode(e.target.value)} placeholder="Live online · Weekend batch" style={input} />
            </Field>

            <Field label="Site status">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                {SITE_STATUSES.map((s) => (
                  <button key={s.key} type="button" onClick={() => setSiteStatus(s.key)} style={choice(siteStatus === s.key)}>
                    <div style={{ font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{s.label}</div>
                    <div style={{ font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{s.sub}</div>
                  </button>
                ))}
              </div>
            </Field>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Check
                checked={hidden}
                onChange={setHidden}
                label="Hide from the website"
                sub="Still reachable by its own link, but kept out of the nav, catalogue and sitemap."
              />
              <Check
                checked={priceOnRequest}
                onChange={setPriceOnRequest}
                label="Fee on request"
                sub="The site shows “On request” and takes no payment. The fee becomes optional."
              />
            </div>

            <Field label="Price note" hint={PLACEHOLDERS}>
              <input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="incl. taxes · from {starts_short}" style={input} />
            </Field>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Standard fee (₹)" error={errors.listPrice} hint="Optional. Struck through beside the fee; never charged.">
                <input value={listPrice} onChange={(e) => setListPrice(e.target.value)} inputMode="numeric" placeholder="2999" style={input} />
              </Field>
              <Field label="Display order" error={errors.sortOrder} hint="Lower comes first on the website.">
                <input type="number" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={input} />
              </Field>
            </div>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Modules label">
                <input value={modulesLabel} onChange={(e) => setModulesLabel(e.target.value)} placeholder="15 modules" style={input} />
              </Field>
              <Field label="Hours label">
                <input value={hoursLabel} onChange={(e) => setHoursLabel(e.target.value)} placeholder="15 learning hours" style={input} />
              </Field>
            </div>

            <Field label="Card image" hint="A path on the website (/assets/…) or a full image URL.">
              <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="/assets/workshop-tables.jpeg" style={input} />
            </Field>

            <Field label="Starts" hint="Shown as the start while no session has a date.">
              <input value={startsLabel} onChange={(e) => setStartsLabel(e.target.value)} placeholder="October 2026" style={input} />
            </Field>

            <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 13 }}>
              <Check
                checked={batch.show}
                onChange={(show) => setBatchField("show", show)}
                label="Show on the Upcoming Batches list"
                sub="Gives the course a card of its own on the website's list of batches."
              />

              {batch.show && (
                <>
                  <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Card tag">
                      <input value={batch.tag} onChange={(e) => setBatchField("tag", e.target.value)} placeholder="PoSH Train-the-Trainer" style={input} />
                    </Field>
                    <Field label="Card title">
                      <input value={batch.title} onChange={(e) => setBatchField("title", e.target.value)} placeholder="PoSH TTT Certification" style={input} />
                    </Field>
                  </div>
                  <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Short name">
                      <input value={batch.short} onChange={(e) => setBatchField("short", e.target.value)} placeholder="PoSH TTT" style={input} />
                    </Field>
                    <Field label="Status label">
                      <input value={batch.statusLabel} onChange={(e) => setBatchField("statusLabel", e.target.value)} placeholder="Enrolling" style={input} />
                    </Field>
                  </div>
                  <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Fee note">
                      <input value={batch.feeNote} onChange={(e) => setBatchField("feeNote", e.target.value)} placeholder="inclusive of taxes" style={input} />
                    </Field>
                    <Field label="Button text">
                      <input value={batch.cta} onChange={(e) => setBatchField("cta", e.target.value)} placeholder="Enrol for this batch" style={input} />
                    </Field>
                  </div>

                  <Field label="Card rows" hint={PLACEHOLDERS}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {batch.rows.map((r, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <button type="button" aria-label="Move row up" onClick={() => moveRow(i, i - 1)} disabled={i === 0} style={arrow}>▲</button>
                            <button type="button" aria-label="Move row down" onClick={() => moveRow(i, i + 1)} disabled={i === batch.rows.length - 1} style={arrow}>▼</button>
                          </div>
                          <input
                            value={r.k}
                            onChange={(e) => setRow(i, { ...r, k: e.target.value })}
                            placeholder="Batch starts"
                            aria-label={`Row ${i + 1} label`}
                            style={{ ...input, flex: "0 0 38%", minWidth: 0 }}
                          />
                          <input
                            value={r.v}
                            onChange={(e) => setRow(i, { ...r, v: e.target.value })}
                            placeholder="{starts}"
                            aria-label={`Row ${i + 1} value`}
                            style={{ ...input, flex: 1, minWidth: 0 }}
                          />
                          <button
                            type="button"
                            aria-label={`Remove row ${i + 1}`}
                            onClick={() => setBatch((b) => ({ ...b, rows: b.rows.filter((_, j) => j !== i) }))}
                            style={{ cursor: "pointer", border: "none", background: "none", padding: "0 4px", font: "600 16px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <div>
                        <button type="button" className="btn btn-soft" onClick={() => setBatchField("rows", [...batch.rows, { k: "", v: "" }])}>
                          + Add row
                        </button>
                      </div>
                    </div>
                  </Field>
                </>
              )}
            </div>
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

            {errors.modules && <div role="alert" style={alert}>{errors.modules}</div>}

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

        {errors.save && <div role="alert" style={alert}>{errors.save}</div>}

        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create course"}
          </button>
        </ModalActions>
      </div>
    </Modal>
  );
}

/** A tickbox with a line saying what ticking it does. */
function Check({ checked, onChange, label, sub }: { checked: boolean; onChange: (next: boolean) => void; label: string; sub: string }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", border: `1.5px solid ${checked ? "#2fc4bc" : "var(--line)"}`, background: checked ? "#eafaf8" : "#fff", borderRadius: 9, padding: "10px 11px" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2, accentColor: "#2fc4bc", flex: "none" }} />
      <span>
        <span style={{ display: "block", font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{label}</span>
        <span style={{ display: "block", font: "500 10px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{sub}</span>
      </span>
    </label>
  );
}

const choice = (on: boolean) =>
  ({
    cursor: "pointer",
    textAlign: "left",
    border: `1.5px solid ${on ? "#2fc4bc" : "var(--line)"}`,
    background: on ? "#eafaf8" : "#fff",
    borderRadius: 9,
    padding: "10px 11px",
  }) as const;

const alert = {
  font: "600 11px/1.5 'Plus Jakarta Sans',sans-serif",
  color: "#9a2c2c",
  background: "#fdeceb",
  border: "1px solid #f3c9c6",
  borderRadius: 9,
  padding: "9px 11px",
} as const;

const arrow = {
  cursor: "pointer",
  border: "none",
  background: "none",
  padding: 0,
  lineHeight: 1,
  font: "700 7px 'Plus Jakarta Sans',sans-serif",
  color: "var(--muted)",
} as const;
