"use client";

import { emptyQuestion, type Quiz, type QuizQuestion } from "@/lib/types";
import { Field, input } from "./ui";

/**
 * The quiz attached to one module.
 *
 * Four options per question, exactly one correct, so the learner site can
 * render every question the same way and mark it without special cases.
 */
export default function QuizEditor({ quiz, onChange }: { quiz: Quiz; onChange: (quiz: Quiz) => void }) {
  const setQuestion = (id: string, patch: Partial<QuizQuestion>) =>
    onChange({ ...quiz, questions: quiz.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });

  const setOption = (q: QuizQuestion, index: number, text: string) =>
    setQuestion(q.id, { options: q.options.map((o, i) => (i === index ? text : o)) });

  const removeQuestion = (id: string) =>
    onChange({ ...quiz, questions: quiz.questions.filter((q) => q.id !== id) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Pass mark (%)" hint="Share of questions a learner must get right to clear the module.">
        <input
          value={String(quiz.passPercent)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9]/g, ""));
            onChange({ ...quiz, passPercent: Math.min(100, Number.isFinite(n) ? n : 0) });
          }}
          inputMode="numeric"
          style={{ ...input, width: 110 }}
        />
      </Field>

      {quiz.questions.map((q, qi) => (
        <div key={q.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase" }}>
              Question {qi + 1}
            </div>
            {quiz.questions.length > 1 && (
              <button
                type="button"
                onClick={() => removeQuestion(q.id)}
                style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
              >
                Remove
              </button>
            )}
          </div>

          <input
            value={q.prompt}
            onChange={(e) => setQuestion(q.id, { prompt: e.target.value })}
            placeholder="What does the Act require an IC to do within 90 days?"
            style={input}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
              Tick the correct answer.
            </div>
            {q.options.map((opt, oi) => {
              const correct = q.answerIndex === oi;
              return (
                <div key={oi} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <button
                    type="button"
                    onClick={() => setQuestion(q.id, { answerIndex: oi })}
                    role="radio"
                    aria-checked={correct}
                    aria-label={`Mark option ${oi + 1} correct`}
                    style={{ flex: "none", width: 18, height: 18, borderRadius: 999, cursor: "pointer", border: `1.5px solid ${correct ? "var(--teal)" : "var(--line)"}`, background: correct ? "var(--teal)" : "#fff", color: "#fff", font: "700 9px 'Plus Jakarta Sans',sans-serif", lineHeight: 1 }}
                  >
                    {correct ? "✓" : ""}
                  </button>
                  <input
                    value={opt}
                    onChange={(e) => setOption(q, oi, e.target.value)}
                    placeholder={`Option ${oi + 1}`}
                    style={{ ...input, borderColor: correct ? "#b9ece7" : "var(--line)", background: correct ? "#f4fdfc" : "#fff" }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-soft"
        onClick={() => onChange({ ...quiz, questions: [...quiz.questions, emptyQuestion()] })}
        style={{ alignSelf: "flex-start" }}
      >
        + Add question
      </button>
    </div>
  );
}
