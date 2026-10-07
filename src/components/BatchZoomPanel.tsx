"use client";

import { useState } from "react";
import { batchLinkFor, linkFor, saveBatchLink, sessionsOf } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { Batch } from "@/lib/types";
import { Field, card, input } from "./ui";
import { useToast } from "./AdminShell";

/**
 * The Zoom room the whole batch meets in.
 *
 * A cohort usually runs every session in the same room, and typing the same
 * join link into eight sessions is eight chances to mistype the one thing a
 * learner cannot work around. Set here once, every session uses it, and a
 * session that needs its own keeps one — that always wins.
 *
 * Inherited when the learner reads it, not copied into each session, so
 * correcting the room here corrects every session still using it.
 */
export default function BatchZoomPanel({ batch, canWrite }: { batch: Batch; canWrite: boolean }) {
  const data = useAdminData();
  const toast = useToast();
  const saved = batchLinkFor(data, batch.id);

  const [joinUrl, setJoinUrl] = useState(saved?.joinUrl ?? "");
  const [meetingId, setMeetingId] = useState(saved?.meetingId ?? "");
  const [passcode, setPasscode] = useState(saved?.passcode ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sessions = sessionsOf(data, batch.id);
  // Sessions carrying a room of their own: the rule does not reach them.
  const overrides = sessions.filter((s) => Boolean(linkFor(data, s.id)?.joinUrl)).length;

  const dirty =
    joinUrl.trim() !== (saved?.joinUrl ?? "") ||
    meetingId.trim() !== (saved?.meetingId ?? "") ||
    passcode.trim() !== (saved?.passcode ?? "");

  const save = async () => {
    const url = joinUrl.trim();
    if (url && !/^https:\/\/\S+$/i.test(url)) {
      setError("A full link, starting https://");
      return;
    }
    setError("");
    setBusy(true);
    const res = await saveBatchLink({ batchId: batch.id, joinUrl: url, meetingId: meetingId.trim(), passcode: passcode.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast(url ? "Zoom room saved for the batch" : "Batch Zoom room cleared");
  };

  const using = sessions.length - overrides;

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" }}>
        <div>
          <div style={{ font: "700 13px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>Zoom room for this batch</div>
          <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>
            {saved?.joinUrl
              ? `Used by ${using} of ${sessions.length} session${sessions.length === 1 ? "" : "s"}${overrides ? ` · ${overrides} with a room of their own` : ""}`
              : "Set it once and every session uses it. A session can still carry its own."}
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Join link" error={error} hint="Learners see this once they have paid, never before.">
          <input
            value={joinUrl}
            onChange={(e) => setJoinUrl(e.target.value)}
            placeholder="https://us06web.zoom.us/j/…"
            disabled={!canWrite}
            style={input}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Meeting ID" hint="Optional.">
            <input value={meetingId} onChange={(e) => setMeetingId(e.target.value)} placeholder="812 3456 7890" disabled={!canWrite} style={input} />
          </Field>
          <Field label="Passcode" hint="Optional.">
            <input value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="posh2026" disabled={!canWrite} style={input} />
          </Field>
        </div>

        {canWrite && (
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? "Saving…" : saved ? "Update room" : "Save room"}
            </button>
            {saved && !dirty && (
              <button
                type="button"
                className="btn btn-soft"
                disabled={busy}
                onClick={() => {
                  if (!confirm("Clear the batch's Zoom room? Sessions with a room of their own keep it.")) return;
                  setJoinUrl("");
                  setMeetingId("");
                  setPasscode("");
                  void saveBatchLink({ batchId: batch.id, joinUrl: "", meetingId: "", passcode: "" }).then((res) => {
                    toast(res.ok ? "Batch Zoom room cleared" : res.error);
                  });
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
