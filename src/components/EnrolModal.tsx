"use client";

import { useMemo, useState } from "react";
import { inr, paiseToRupees, rupeesToPaise } from "@/lib/format";
import { LMS_URL } from "@/lib/share";
import { batchSeatsLeft, batchWindow, createEnrolment, enrollableBatches, setEnrolmentStatus } from "@/lib/store";
import { useAdminData, useCatalogStatus } from "@/lib/useStore";
import type { Enrolment } from "@/lib/types";
import EnrolmentShare from "./EnrolmentShare";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

type Props = { prefill: { courseId?: string; batchId?: string } | null; onClose: () => void };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "3 Oct" / "3 Oct – 18 Oct 2026" from ISO days. */
function range(from: string | null, to: string | null): string {
  const fmt = (iso: string, year: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  if (!from) return "dates to be set";
  if (!to || to === from) return fmt(from, true);
  return `${fmt(from, false)} – ${fmt(to, true)}`;
}

/**
 * Enrol someone by hand, for enquiries that arrive by phone, WhatsApp or
 * email: their name, email and phone, the batch, and the Razorpay payment link
 * to send them. They start as payment pending; once the money arrives, mark
 * them paid here or from the Enrolments list.
 *
 * No account is created. When they sign up on the LMS with the same email,
 * the enrolment follows them there.
 */
export default function EnrolModal({ prefill, onClose }: Props) {
  const data = useAdminData();
  const catalog = useCatalogStatus();
  const toast = useToast();

  const prefillBatch = prefill?.batchId;
  const batches = useMemo(() => {
    const open = enrollableBatches(data);
    // A batch named in the prefill stays offered even if it has closed since.
    const extra = prefillBatch && !open.some((b) => b.id === prefillBatch)
      ? data.batches.filter((b) => b.id === prefillBatch)
      : [];
    return [...open, ...extra];
  }, [data, prefillBatch]);

  const courses = data.courses.filter((c) => batches.some((b) => b.courseId === c.id));

  const initialBatch =
    prefill?.batchId ??
    batches.find((b) => !prefill?.courseId || b.courseId === prefill.courseId)?.id ??
    "";

  const [batchId, setBatchId] = useState(initialBatch);
  const batch = data.batches.find((b) => b.id === batchId);
  const course = data.courses.find((c) => c.id === batch?.courseId);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [amount, setAmount] = useState(course ? paiseToRupees(course.pricePaise) : "");
  const [amountTouched, setAmountTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Enrolment | null>(null);

  const pickBatch = (id: string) => {
    setBatchId(id);
    const next = data.courses.find((c) => c.id === data.batches.find((b) => b.id === id)?.courseId);
    // Follow the new course's fee, unless someone typed a figure of their own.
    if (!amountTouched) setAmount(next ? paiseToRupees(next.pricePaise) : "");
  };

  const submit = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter their name.";
    if (!email.trim()) e.email = "Email is needed — it is how their enrolment finds them when they sign up.";
    else if (!EMAIL.test(email.trim())) e.email = "That email does not look right.";
    if (phone.trim() && phone.replace(/\D/g, "").length < 10) e.phone = "Give the full mobile number.";
    if (!batch) e.batchId = "Pick the batch they are joining.";
    else if (batchSeatsLeft(data, batch) < 1) e.batchId = "That batch is full.";
    if (paymentLink.trim() && !/^https:\/\/\S+$/i.test(paymentLink.trim())) e.paymentLink = "Paste the full link, starting https://";
    const amountPaise = amount.trim() ? rupeesToPaise(amount) : 0;
    if (amountPaise === null) e.amount = "Enter the amount in rupees, e.g. 32000.";
    setErrors(e);
    if (Object.keys(e).length || !batch || !course) return;

    setBusy(true);
    const res = await createEnrolment({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      batchId: batch.id,
      courseId: course.id,
      source: "Admin",
      amountPaise: amountPaise as number,
      seats: 1,
      method: "link",
      status: "pending",
      paymentLink: paymentLink.trim(),
      notes: "",
    });
    setBusy(false);
    if (!res.ok) {
      setErrors({ save: res.error });
      return;
    }
    setDone(res.enrolment);
  };

  /* ------------------------------ step 2 ------------------------------ */
  if (done) {
    // Read the live row, so marking paid below updates this view too.
    const current = data.enrolments.find((x) => x.id === done.id) ?? done;
    const paid = current.status === "paid";

    const markPaid = async () => {
      setBusy(true);
      const res = await setEnrolmentStatus(current.id, "paid");
      setBusy(false);
      if (!res.ok) toast(res.error);
      else toast(`${current.name} marked as paid`);
    };

    return (
      <Modal title={paid ? "Enrolled and paid" : "Enrolment created"} sub={`${current.name} · ${course?.short || course?.title || ""} · ${batch?.name ?? ""}`} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: paid ? "#eafaf8" : "#fdf4e3", border: `1px solid ${paid ? "#b9ece7" : "#f0dcae"}`, borderRadius: 11, padding: "14px 16px" }}>
            <div style={{ font: "700 12.5px 'Plus Jakarta Sans',sans-serif", color: paid ? "#136f6a" : "#9a6a12" }}>
              {paid ? "Payment confirmed — they are enrolled" : "Payment pending"}
            </div>
            <div style={{ font: "500 11.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--body)", marginTop: 4 }}>
              {paid
                ? `Send them the welcome message: it tells them to sign up at ${LMS_URL} and enter their enrolment code.`
                : current.paymentLink
                  ? "Send them the payment link below. When the payment reaches you, mark it paid — here or from Enrolments."
                  : "No payment link was added. Collect payment your usual way, then mark it paid — here or from Enrolments."}
            </div>
          </div>

          {!paid && current.paymentLink && (
            <Field label="Payment link">
              <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: "#f8fafc" }}>
                {current.paymentLink}
              </div>
            </Field>
          )}

          {current.claimCode && (
            <Field label="Enrolment code" hint="Included in the messages below. They enter it once after signing up on the LMS, and the course appears in their account.">
              <div style={{ border: "1px dashed #2fc4bc", borderRadius: 8, padding: "10px 12px", font: "800 16px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", letterSpacing: ".08em", background: "#f3fcfb", textAlign: "center" }}>
                {current.claimCode}
              </div>
            </Field>
          )}

          <EnrolmentShare enrolment={current} buttons />

          <ModalActions>
            {!paid && (
              <button type="button" className="btn btn-soft" onClick={() => void markPaid()} disabled={busy}>
                {busy ? "Saving…" : "Mark payment complete"}
              </button>
            )}
            <button type="button" className="btn btn-dark" onClick={onClose}>Done</button>
          </ModalActions>
        </div>
      </Modal>
    );
  }

  /* ------------------------------ step 1 ------------------------------ */
  return (
    <Modal title="Enrol someone" sub="For enquiries that come by phone, WhatsApp or email" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {batches.length === 0 ? (
          <div style={{ font: "500 12.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--body)", background: "#fdf4e3", border: "1px solid #f0dcae", borderRadius: 10, padding: "14px 16px" }}>
            {catalog.state === "ready"
              ? "No batch is open for enrolment. Create one under Batches, or open an existing one for enrolment."
              : catalog.state === "error"
                ? "Batches could not be loaded from the database. Close this and try again."
                : "Loading batches…"}
          </div>
        ) : (
          <>
            <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Full name" error={errors.name}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Rao" autoFocus style={input} />
              </Field>
              <Field label="Mobile" error={errors.phone} hint="For WhatsApp.">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98xxx xxxxx" inputMode="tel" style={input} />
              </Field>
            </div>

            <Field label="Email" error={errors.email} hint="They sign up on the LMS with this address to reach their course.">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" inputMode="email" style={input} />
            </Field>

            <Field
              label="Batch"
              error={errors.batchId}
              hint={batch ? `${range(batchWindow(data, batch).from, batchWindow(data, batch).to)} · ${batchSeatsLeft(data, batch)} of ${batch.seats} seats left` : undefined}
            >
              <select value={batchId} onChange={(e) => pickBatch(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                <option value="" disabled>Choose a batch…</option>
                {courses.map((c) => (
                  <optgroup key={c.id} label={c.short || c.title}>
                    {batches.filter((b) => b.courseId === c.id).map((b) => {
                      const left = batchSeatsLeft(data, b);
                      return (
                        <option key={b.id} value={b.id} disabled={left === 0}>
                          {b.name}{left === 0 ? " — full" : ` — ${left} left`}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            </Field>

            <Field label="Payment link" error={errors.paymentLink} hint="Paste the Razorpay payment link to send them. Optional.">
              <input value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} placeholder="https://rzp.io/rzp/…" style={input} />
            </Field>

            <Field label="Amount (₹)" error={errors.amount} hint={course ? `Course fee ${inr(course.pricePaise)}` : undefined}>
              <input
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }}
                inputMode="numeric"
                placeholder="32000"
                style={input}
              />
            </Field>

            {errors.save && (
              <div role="alert" style={{ font: "600 11px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", background: "#fdeceb", border: "1px solid #f3c9c6", borderRadius: 9, padding: "9px 11px" }}>
                {errors.save}
              </div>
            )}

            <ModalActions>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
                {busy ? "Saving…" : "Create enrolment"}
              </button>
            </ModalActions>
          </>
        )}
      </div>
    </Modal>
  );
}
