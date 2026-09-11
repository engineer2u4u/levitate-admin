"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";
import { createEnrolment, seatsLeft } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { PaymentMethod } from "@/lib/types";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

const METHODS: { key: PaymentMethod; label: string; sub: string }[] = [
  { key: "link", label: "Payment link", sub: "SMS + email" },
  { key: "invoice", label: "Invoice", sub: "Net 15 terms" },
  { key: "paid", label: "Mark as paid", sub: "Already collected" },
];

type Props = { prefill: { courseId?: string; sessionId?: string } | null; onClose: () => void };

export default function EnrolModal({ prefill, onClose }: Props) {
  const data = useAdminData();
  const toast = useToast();

  // Only sellable courses; a draft has no public price yet.
  const sellable = data.courses.filter((c) => c.status === "live");
  const initialCourse = prefill?.courseId ?? sellable[0]?.id ?? "";

  const [courseId, setCourseId] = useState(initialCourse);
  const [sessionId, setSessionId] = useState(prefill?.sessionId ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [seats, setSeats] = useState("1");
  const [method, setMethod] = useState<PaymentMethod>("link");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ name: string; link: string; method: PaymentMethod; contact: string } | null>(null);

  const course = data.courses.find((c) => c.id === courseId) ?? null;

  // Sessions belong to the chosen course, and a closed one cannot take anybody.
  const sessions = useMemo(
    () => data.sessions.filter((s) => s.courseId === courseId && s.status !== "closed"),
    [data.sessions, courseId],
  );

  const chosenSession = sessions.find((s) => s.id === sessionId) ?? null;
  const remaining = chosenSession ? seatsLeft(data, chosenSession) : null;
  const seatCount = Math.max(1, Number(seats) || 1);
  const amountPaise = course ? course.pricePaise * seatCount : 0;

  const pickCourse = (id: string) => {
    setCourseId(id);
    setSessionId(""); // the old session belongs to a different course
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter the customer's name.";
    if (!phone.trim() && !email.trim()) e.phone = "Give a phone number or an email so they can be reached.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "That email does not look right.";
    if (!courseId) e.courseId = "Pick a course.";
    if (!sessionId) e.sessionId = "Pick a session.";
    if (!Number.isFinite(Number(seats)) || Number(seats) < 1) e.seats = "At least one seat.";
    else if (remaining !== null && seatCount > remaining) {
      e.seats = remaining === 0 ? "That session is full." : `Only ${remaining} seat${remaining === 1 ? "" : "s"} left on that session.`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate() || !course || !chosenSession) return;
    const created = createEnrolment({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      courseId,
      sessionId,
      source: seatCount > 1 ? "Corporate" : "Phone",
      amountPaise,
      seats: seatCount,
      method,
      paid: method === "paid",
    });
    const slug = created.name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6) || "new";
    setDone({
      name: created.name,
      method,
      contact: created.phone || created.email,
      link: `pay.levitatepeoplesoft.com/e/${slug}-${created.id.slice(-5)}`,
    });
  };

  /* ------------------------------ step 2 ------------------------------ */
  if (done) {
    const paid = done.method === "paid";
    return (
      <Modal title="Enrolment created" sub={done.name} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "#eafaf8", border: "1px solid #b9ece7", borderRadius: 11, padding: "14px 16px" }}>
            <div style={{ font: "700 12.5px 'Plus Jakarta Sans',sans-serif", color: "#136f6a" }}>
              {paid ? "Enrolled and marked as paid" : done.method === "invoice" ? "Enrolled — invoice to raise" : "Enrolled — payment link ready"}
            </div>
            <div style={{ font: "500 11.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--body)", marginTop: 4 }}>
              {paid
                ? `${done.name} now holds a seat and appears in the enrolments list.`
                : `The seat is held for ${done.method === "invoice" ? "15 days on Net 15 terms" : "48 hours"}, then released back to the session.`}
            </div>
          </div>

          {!paid && (
            <Field label="Payment link">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0, border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: "#f8fafc" }}>
                  {done.link}
                </div>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => {
                    void navigator.clipboard?.writeText(done.link).then(
                      () => toast("Payment link copied"),
                      () => toast("Could not copy — select the link and copy manually"),
                    );
                  }}
                >
                  Copy
                </button>
              </div>
            </Field>
          )}

          <ModalActions>
            {!paid && (
              <button type="button" className="btn btn-ghost" onClick={() => toast(`Link resent to ${done.contact || "the customer"}`)}>
                Resend
              </button>
            )}
            <button type="button" className="btn btn-dark" onClick={() => { toast("Enrolment saved"); onClose(); }}>Done</button>
          </ModalActions>
        </div>
      </Modal>
    );
  }

  /* ------------------------------ step 1 ------------------------------ */
  return (
    <Modal title="Enrol a customer" sub="For enquiries you handle over the phone or email" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sellable.length === 0 ? (
          <div style={{ font: "500 12.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--body)", background: "#fdf4e3", border: "1px solid #f0dcae", borderRadius: 10, padding: "14px 16px" }}>
            No course is live yet. Publish a course before enrolling anyone.
          </div>
        ) : (
          <>
            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Full name" error={errors.name}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Rao" style={input} />
              </Field>
              <Field label="Mobile" error={errors.phone}>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98xxx xxxxx" style={input} />
              </Field>
            </div>

            <Field label="Email" error={errors.email}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" style={input} />
            </Field>

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Course" error={errors.courseId}>
                <select value={courseId} onChange={(e) => pickCourse(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                  {sellable.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </Field>
              <Field
                label="Session"
                error={errors.sessionId}
                hint={remaining !== null ? `${remaining} of ${chosenSession?.seats} seats left` : undefined}
              >
                <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                  <option value="">Select a session…</option>
                  {sessions.map((s) => {
                    const left = seatsLeft(data, s);
                    return (
                      <option key={s.id} value={s.id} disabled={left === 0}>
                        {s.date} · {s.mode}{left === 0 ? " — full" : ` — ${left} left`}
                      </option>
                    );
                  })}
                </select>
              </Field>
            </div>

            {sessions.length === 0 && (
              <div style={{ font: "500 11.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "#9a6a12", background: "#fdf4e3", border: "1px solid #f0dcae", borderRadius: 9, padding: "10px 12px" }}>
                This course has no scheduled sessions yet. Add one from the Courses screen first.
              </div>
            )}

            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Seats" error={errors.seats} hint="More than one becomes a corporate booking">
                <input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} style={input} />
              </Field>
              <Field label="Payment">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6 }}>
                  {METHODS.map((m) => {
                    const on = method === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setMethod(m.key)}
                        title={m.sub}
                        style={{ cursor: "pointer", border: `1.5px solid ${on ? "#2fc4bc" : "var(--line)"}`, background: on ? "#eafaf8" : "#fff", borderRadius: 9, padding: "9px 6px", font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ font: "600 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>
                Amount due{seatCount > 1 ? ` · ${seatCount} seats` : ""}
              </div>
              <div style={{ font: "700 18px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{inr(amountPaise)}</div>
            </div>

            <ModalActions>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={sessions.length === 0}>
                {method === "paid" ? "Create enrolment" : "Create & send payment link"}
              </button>
            </ModalActions>
          </>
        )}
      </div>
    </Modal>
  );
}
