"use client";

import { useState } from "react";
import type { Batch } from "@/lib/types";
import { Field, Modal, ModalActions, input } from "./ui";

/**
 * Closing a run of a programme, and dating it.
 *
 * A confirm() would have done for the closing. The date is why this is a form:
 * it is printed on every certificate issued out of the batch, and it is not
 * reliably today — a programme that ended on Sunday often gets closed in the
 * office on Tuesday. So it is asked for, with the last session's date offered
 * rather than assumed.
 */
export default function CompleteBatchModal({
  batch,
  lastSessionOn,
  busy,
  onClose,
  onConfirm,
}: {
  batch: Batch;
  /** The last session's date, which is usually the answer. */
  lastSessionOn: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (completedOn: string) => void;
}) {
  const [date, setDate] = useState(
    batch.completedOn || lastSessionOn || batch.endsOn || new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState("");

  const submit = () => {
    if (!date) return setError("Give the day the programme finished.");
    // A certificate dated in the future is a certificate nobody can defend.
    if (date > new Date().toISOString().slice(0, 10)) {
      return setError("That is in the future — a certificate cannot be dated ahead of today.");
    }
    setError("");
    onConfirm(date);
  };

  return (
    <Modal title={`Mark ${batch.name} completed`} sub="Closes the run and opens its certificates" onClose={onClose} width={460}>
      <Field
        label="Completed on"
        error={error}
        hint={lastSessionOn && date === lastSessionOn ? "The last session's date." : "The day the programme finished."}
      >
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} autoFocus />
      </Field>

      <div style={{ font: "500 11.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", background: "var(--surface)", borderRadius: 9, padding: "11px 13px" }}>
        Its sessions close and it moves to the Completed history. Delegates who have finished every lesson can then
        download their certificate, and <strong style={{ color: "var(--body)" }}>every certificate out of this batch is
        dated this day</strong> — not the day each of them happened to finish.
      </div>

      <ModalActions>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-dark" onClick={submit} disabled={busy}>
          {busy ? "Marking…" : "Mark completed"}
        </button>
      </ModalActions>
    </Modal>
  );
}
