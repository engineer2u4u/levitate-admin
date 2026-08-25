"use client";

import { useState } from "react";
import {
  IMAGE_SIZES,
  LESSON_KINDS,
  emptyLesson,
  emptyQuiz,
  type Lesson,
  type Module,
} from "@/lib/types";
import ImageUpload from "./ImageUpload";
import QuizEditor from "./QuizEditor";
import { Field, input } from "./ui";

/**
 * One module: its cover, its lessons, and optionally a quiz.
 *
 * Lessons edit in place rather than in another dialog — a module is already
 * two levels inside the course, and a third stacked window is where people
 * lose track of what they are editing.
 */
export default function ModuleEditor({
  module,
  index,
  onChange,
  onBack,
  onDelete,
}: {
  module: Module;
  index: number;
  onChange: (module: Module) => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  const setLesson = (id: string, patch: Partial<Lesson>) =>
    onChange({ ...module, lessons: module.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  const addLesson = () => {
    const lesson = emptyLesson();
    onChange({ ...module, lessons: [...module.lessons, lesson] });
    setOpenLesson(lesson.id);
  };

  const removeLesson = (id: string) =>
    onChange({ ...module, lessons: module.lessons.filter((l) => l.id !== id) });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= module.lessons.length) return;
    const next = [...module.lessons];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ ...module, lessons: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 11px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)" }}
        >
          ← All modules
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete module ${index + 1}${module.title ? ` — ${module.title}` : ""}? Its lessons and quiz go too.`)) onDelete();
          }}
          style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
        >
          Delete module
        </button>
      </div>

      <Field label={`Module ${index + 1} title`}>
        <input
          value={module.title}
          onChange={(e) => onChange({ ...module, title: e.target.value })}
          placeholder="The legal framework of the POSH Act"
          style={input}
        />
      </Field>

      <Field label="Summary" hint="One or two lines, shown under the module title.">
        <textarea
          value={module.summary}
          onChange={(e) => onChange({ ...module, summary: e.target.value })}
          rows={2}
          placeholder="What this module covers and why it matters"
          style={{ ...input, resize: "vertical", lineHeight: 1.6 }}
        />
      </Field>

      <ImageUpload
        label="Module cover"
        value={module.imageUrl}
        onChange={(url) => onChange({ ...module, imageUrl: url })}
        folder="modules"
        size={IMAGE_SIZES.module}
      />

      {/* ------------------------------ lessons ------------------------------ */}

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ font: "700 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>Lessons</div>
            <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
              {module.lessons.length === 0 ? "Nothing yet" : `${module.lessons.length} in order`}
            </div>
          </div>
          <button type="button" className="btn btn-soft" onClick={addLesson}>+ Add lesson</button>
        </div>

        {module.lessons.length === 0 ? (
          <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "18px 14px", textAlign: "center", font: "500 11.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
            A lesson is a piece of reading, a video, or something to download. Learners work through them in this order.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {module.lessons.map((lesson, li) => {
              const open = openLesson === lesson.id;
              const kind = LESSON_KINDS.find((k) => k.key === lesson.kind);
              return (
                <div key={lesson.id} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: open ? "var(--surface)" : "#fff" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button type="button" aria-label="Move up" onClick={() => move(li, li - 1)} disabled={li === 0} style={arrow}>▲</button>
                      <button type="button" aria-label="Move down" onClick={() => move(li, li + 1)} disabled={li === module.lessons.length - 1} style={arrow}>▼</button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setOpenLesson(open ? null : lesson.id)}
                      style={{ flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer", border: "none", background: "none", padding: 0 }}
                    >
                      <div style={{ font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lesson.title || `Lesson ${li + 1} — untitled`}
                      </div>
                      <div style={{ font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{kind?.label}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { if (confirm(`Delete "${lesson.title || `Lesson ${li + 1}`}"?`)) removeLesson(lesson.id); }}
                      style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
                    >
                      Delete
                    </button>
                  </div>

                  {open && (
                    <div style={{ padding: "13px 12px", borderTop: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 12 }}>
                      <Field label="Lesson title">
                        <input value={lesson.title} onChange={(e) => setLesson(lesson.id, { title: e.target.value })} placeholder="What the Act actually says" style={input} />
                      </Field>

                      <div>
                        <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>Type</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7 }}>
                          {LESSON_KINDS.map((k) => {
                            const on = lesson.kind === k.key;
                            return (
                              <button
                                key={k.key}
                                type="button"
                                onClick={() => setLesson(lesson.id, { kind: k.key })}
                                title={k.sub}
                                style={{ cursor: "pointer", border: `1.5px solid ${on ? "#2fc4bc" : "var(--line)"}`, background: on ? "#eafaf8" : "#fff", borderRadius: 9, padding: "8px 9px", font: "700 11px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}
                              >
                                {k.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {lesson.kind === "reading" ? (
                        <Field label="Reading material" hint="Leave a blank line between paragraphs.">
                          <textarea
                            value={lesson.body}
                            onChange={(e) => setLesson(lesson.id, { body: e.target.value })}
                            rows={7}
                            placeholder="The text learners read in this lesson."
                            style={{ ...input, resize: "vertical", lineHeight: 1.7 }}
                          />
                        </Field>
                      ) : (
                        <Field
                          label={lesson.kind === "video" ? "Video link" : "File link"}
                          hint={lesson.kind === "video" ? "YouTube, Vimeo or wherever it is hosted." : "A PDF or document learners can download."}
                        >
                          <input value={lesson.url} onChange={(e) => setLesson(lesson.id, { url: e.target.value })} placeholder="https://…" style={input} />
                        </Field>
                      )}

                      <ImageUpload
                        label="Lesson image (optional)"
                        value={lesson.imageUrl}
                        onChange={(url) => setLesson(lesson.id, { imageUrl: url })}
                        folder="lessons"
                        size={IMAGE_SIZES.lesson}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------- quiz -------------------------------- */}

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: module.quiz ? 12 : 0 }}>
          <div>
            <div style={{ font: "700 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>Quiz</div>
            <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
              {module.quiz ? `${module.quiz.questions.length} question${module.quiz.questions.length === 1 ? "" : "s"}` : "Optional — add one where it earns its place"}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              if (module.quiz) {
                if (!confirm("Remove this quiz and its questions?")) return;
                onChange({ ...module, quiz: null });
              } else {
                onChange({ ...module, quiz: emptyQuiz() });
              }
            }}
          >
            {module.quiz ? "Remove quiz" : "+ Add a quiz"}
          </button>
        </div>

        {module.quiz && <QuizEditor quiz={module.quiz} onChange={(quiz) => onChange({ ...module, quiz })} />}
      </div>
    </div>
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
