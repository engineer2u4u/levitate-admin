"use client";

import { useState } from "react";
import { updateCourse } from "@/lib/store";
import {
  batchCardFor,
  emptyModule,
  modulesFromWebsite,
  modulesLabelFor,
  type Course,
  type CourseInput,
  type CourseStatus,
  type Module,
  type SiteStatus,
} from "@/lib/types";
import BrochureUpload from "./BrochureUpload";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const STATUSES: { key: CourseStatus; label: string; sub: string }[] = [
  { key: "draft", label: "Draft", sub: "Not on the website" },
  { key: "live", label: "Live", sub: "Published, and listed as a batch" },
  { key: "archived", label: "Archived", sub: "Retired, history kept" },
];

/** What a published course offers — separate from `status`, which decides
 *  whether it is published at all. */
const SITE_STATUSES: { key: SiteStatus; label: string; sub: string }[] = [
  { key: "enrolling", label: "Enrolling", sub: "Taking bookings now" },
  { key: "waitlist", label: "Waitlist", sub: "Collecting interest until dates are set" },
];

/**
 * Edit a course.
 *
 * Deliberately five things, not fifty. The catalogue's copy — titles, fees,
 * categories, card text, imagery — is the website's, set once in a migration
 * and the same for everyone who visits. What changes between batches is what
 * an admin owns here: when it starts, its syllabus, whether it is published,
 * what a published course offers, and the brochure a visitor downloads.
 *
 * Module titles stay in the admin: 0008 withholds the module tree from the
 * public role, because it carries lesson bodies and quiz answers. What the
 * website quotes is how many there are.
 *
 * There is no create: a new course arrives with its copy, its slug and its
 * imagery, which is a migration's job rather than a form's.
 */
export default function CourseModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const toast = useToast();

  const [startsLabel, setStartsLabel] = useState(course.startsLabel);
  // Full module records, not just their titles: a module carries lessons and a
  // quiz that nothing here edits, and renaming one must not drop them.
  const [modules, setModules] = useState<Module[]>(course.modules);
  // Modules mirroring lesson content in the website's code keep their ids,
  // number and order; only their titles are edited here.
  const locked = modulesFromWebsite(course.modules);
  const [status, setStatus] = useState<CourseStatus>(course.status);
  const [siteStatus, setSiteStatus] = useState<SiteStatus>(course.siteStatus);
  const [brochureUrl, setBrochureUrl] = useState(course.brochureUrl);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const setTitle = (id: string, title: string) =>
    setModules((ms) => ms.map((m) => (m.id === id ? { ...m, title } : m)));

  const addModule = () => setModules((ms) => [...ms, emptyModule()]);

  const moveModule = (from: number, to: number) => {
    if (to < 0 || to >= modules.length) return;
    setModules((ms) => {
      const next = [...ms];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const submit = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    // A blank title is a blank line in the published syllabus.
    if (status === "live" && modules.some((m) => !m.title.trim())) e.modules = "Every module needs a title.";
    setErrors(e);
    if (Object.keys(e).length) return;

    const trimmed = modules.map((m) => ({ ...m, title: m.title.trim() }));
    const patch: Partial<CourseInput> = {
      startsLabel: startsLabel.trim(),
      modules: trimmed,
      status,
      siteStatus,
      brochureUrl,
      // Copy the form does not edit, but whose number it can invalidate — unless
      // the modules mirror LMS content, whose count ("13") is not the
      // published syllabus's ("15 modules") and must not overwrite it.
      modulesLabel: locked ? course.modulesLabel : modulesLabelFor(course.modulesLabel, trimmed.length),
      // Publishing is the whole instruction: the batch card follows from the
      // course rather than being a separate thing to remember.
      batch: batchCardFor({ ...course, status, siteStatus, modules: trimmed }),
    };

    setBusy(true);
    const res = await updateCourse(course.id, patch);
    setBusy(false);
    if (!res.ok) {
      // Kept open, so nothing typed is lost; the list behind has rolled back.
      setErrors({ save: res.error });
      toast(res.error);
      return;
    }
    toast(
      status !== "live"
        ? `Saved as ${status} — off the website`
        : course.hidden
          ? "Saved — live, and kept off the website's lists"
          : "Saved — live and listed under Upcoming Batches",
    );
    onClose();
  };

  return (
    <Modal title="Edit course" sub={course.title} onClose={onClose} width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <Field
          label="Starts"
          hint="Shown as the start until a session carries a date: &ldquo;October 2026&rdquo;, &ldquo;3 October 2026&rdquo;."
        >
          <input
            value={startsLabel}
            onChange={(e) => setStartsLabel(e.target.value)}
            placeholder="October 2026"
            style={input}
          />
        </Field>

        <Field label="Status">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            {STATUSES.map((s) => (
              <button key={s.key} type="button" onClick={() => setStatus(s.key)} style={choice(status === s.key)}>
                <div style={{ font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{s.label}</div>
                <div style={{ font: "500 10px/1.4 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{s.sub}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Site status"
          hint={siteStatus === "enrolling"
            ? "The batch card reads Enrolling, and its button takes bookings."
            : "The batch card reads Enquiries open, and its button asks them to enquire."}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
            {SITE_STATUSES.map((s) => (
              <button key={s.key} type="button" onClick={() => setSiteStatus(s.key)} style={choice(siteStatus === s.key)}>
                <div style={{ font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{s.label}</div>
                <div style={{ font: "500 10px/1.4 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{s.sub}</div>
              </button>
            ))}
          </div>
        </Field>

        {status === "live" && !course.hidden && (
          <div style={note}>
            Live, so the course is listed on the website&rsquo;s Upcoming Batches page — with its start,
            duration, timing, mode and {modules.length || "no"} module{modules.length === 1 ? "" : "s"}.
          </div>
        )}

        <BrochureUpload value={brochureUrl} onChange={setBrochureUrl} />

        {/* --------------------------------------------------------- modules */}
        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase" }}>
                Modules
              </div>
              <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 4 }}>
                {locked
                  ? `${modules.length} modules, matching the lessons on the LMS. Rename them here; adding, removing or reordering happens in the LMS content.`
                  : modules.length === 0
                    ? "The syllabus, in the order taught."
                    : `${modules.length} module${modules.length === 1 ? "" : "s"}, in the order shown.`}
              </div>
            </div>
            {!locked && <button type="button" className="btn btn-soft" onClick={addModule}>+ Add module</button>}
          </div>

          {errors.modules && <div role="alert" style={alert}>{errors.modules}</div>}

          {modules.length === 0 ? (
            <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "18px 16px", textAlign: "center", font: "500 11px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
              No modules yet. The count is what the website quotes as the curriculum.
            </div>
          ) : (
            modules.map((m, i) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                {!locked && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "none" }}>
                    <button type="button" aria-label="Move up" onClick={() => moveModule(i, i - 1)} disabled={i === 0} style={arrow}>▲</button>
                    <button type="button" aria-label="Move down" onClick={() => moveModule(i, i + 1)} disabled={i === modules.length - 1} style={arrow}>▼</button>
                  </div>
                )}
                <div aria-hidden style={{ flex: "none", width: 20, textAlign: "right", font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
                  {i + 1}.
                </div>
                <input
                  value={m.title}
                  onChange={(e) => setTitle(m.id, e.target.value)}
                  placeholder="Foundations & the CLEAR framework"
                  aria-label={`Module ${i + 1} title`}
                  style={{ ...input, flex: 1, minWidth: 0 }}
                />
                {!locked && (
                  <button
                    type="button"
                    aria-label={`Remove module ${i + 1}`}
                    onClick={() => setModules((ms) => ms.filter((x) => x.id !== m.id))}
                    style={{ flex: "none", cursor: "pointer", border: "none", background: "none", padding: "0 4px", font: "600 16px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {errors.save && <div role="alert" style={alert}>{errors.save}</div>}

        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </ModalActions>
      </div>
    </Modal>
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

const note = {
  font: "500 11px/1.6 'Plus Jakarta Sans',sans-serif",
  color: "#136f6a",
  background: "#eafaf8",
  border: "1px solid #c7ece9",
  borderRadius: 9,
  padding: "9px 11px",
} as const;

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
