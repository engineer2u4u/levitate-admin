"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FORM_LABEL,
  deleteEnquiry,
  downloadCsv,
  listEnquiries,
  type Enquiry,
  type EnquiryForm,
} from "@/lib/enquiries";
import { EmptyState, Modal, ModalActions, Pill, card, input, label, th } from "./ui";

const SANS = "'Plus Jakarta Sans',sans-serif";
// minmax(0,…) rather than a bare fr: an fr track never shrinks below its
// min-content width, so a single long unbroken line — a payment note, a long
// email — would widen its own column and crush all the others. Cells clip
// instead; the row opens a dialog with the full text.
const GRID = "minmax(0,1.1fr) minmax(0,1.6fr) minmax(0,1.3fr) minmax(0,1.6fr) minmax(0,0.9fr)";
const cell = { minWidth: 0 } as const;
const clip = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** yyyy-mm-dd in local time, which is what a date input speaks. */
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const FORM_TONE: Record<EnquiryForm, "good" | "warn" | "bad" | "neutral"> = {
  popup: "good",
  contact: "neutral",
  service: "warn",
  kit: "neutral",
  masterclass: "good",
  other: "neutral",
};

/**
 * Every enquiry the website has received, newest first.
 *
 * Filtering happens here rather than in the query: the whole list is a few
 * thousand rows at most, and filtering in the browser means every change is
 * instant and the CSV exports exactly the rows on screen — which is what
 * "download what I'm looking at" should mean.
 */
export default function EnquiriesView() {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Enquiry | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [form, setForm] = useState<EnquiryForm | "all">("all");
  const [programme, setProgramme] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    listEnquiries()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Only offer programmes that actually occur, so every option returns rows.
  const programmes = useMemo(
    () => [...new Set(rows.map((r) => r.intent).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (form !== "all" && r.form !== form) return false;
      if (programme !== "all" && r.intent !== programme) return false;
      const day = localDay(r.created_at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (needle) {
        const hay = `${r.name} ${r.email} ${r.phone} ${r.organization} ${r.intent} ${r.message}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, form, programme, from, to]);

  const filtered = q || form !== "all" || programme !== "all" || from || to;
  const clear = () => { setQ(""); setForm("all"); setProgramme("all"); setFrom(""); setTo(""); };

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(shown, `levitate-enquiries-${stamp}${filtered ? "-filtered" : ""}.csv`);
  };

  const remove = async (e: Enquiry) => {
    if (!window.confirm(`Delete the enquiry from ${e.name}? This cannot be undone.`)) return;
    try {
      await deleteEnquiry(e.id);
      setRows((rs) => rs.filter((r) => r.id !== e.id));
      setOpen(null);
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  if (loading) return <div style={{ ...card, padding: 24, color: "#5b6e82" }}>Loading enquiries…</div>;

  if (error) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <div style={{ font: `700 15px ${SANS}`, color: "#0a1b33", marginBottom: 6 }}>Could not load enquiries</div>
        <div style={{ font: `400 13.5px/1.7 ${SANS}`, color: "#5b6e82" }}>{error}</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No enquiries yet"
        body="Every enquiry sent from the website — the pop-up, the contact page, the service pages — appears here the moment it is submitted."
      />
    );
  }

  return (
    <>
      {/* ---------------------------------------------------------- filters */}
      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.4fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>Search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email, phone, organisation, message…"
              style={input}
            />
          </div>
          <div>
            <div style={label}>Form</div>
            <select value={form} onChange={(e) => setForm(e.target.value as EnquiryForm | "all")} style={{ ...input, cursor: "pointer" }}>
              <option value="all">All forms</option>
              {(Object.keys(FORM_LABEL) as EnquiryForm[]).map((f) => (
                <option key={f} value={f}>{FORM_LABEL[f]}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Programme</div>
            <select value={programme} onChange={(e) => setProgramme(e.target.value)} style={{ ...input, cursor: "pointer" }}>
              <option value="all">All programmes</option>
              {programmes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>From</div>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={input} />
          </div>
          <div>
            <div style={label}>To</div>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={input} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ font: `600 12.5px ${SANS}`, color: "#5b6e82" }}>
            {filtered ? `${shown.length} of ${rows.length} enquiries` : `${rows.length} enquiries`}
            {filtered && (
              <button type="button" onClick={clear} style={{ marginLeft: 12, cursor: "pointer", border: "none", background: "none", font: `700 12.5px ${SANS}`, color: "#1b8f88" }}>
                Clear filters
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={shown.length === 0}
            style={{
              cursor: shown.length ? "pointer" : "not-allowed",
              border: "none",
              borderRadius: 8,
              padding: "10px 16px",
              background: "linear-gradient(120deg,#2fc4bc,#2f7fd6)",
              color: "#fff",
              font: `700 12.5px ${SANS}`,
              opacity: shown.length ? 1 : 0.5,
            }}
          >
            Download CSV ({shown.length})
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------ table */}
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ ...th, ...cell }}>Received</div>
          <div style={{ ...th, ...cell }}>Name &amp; organisation</div>
          <div style={{ ...th, ...cell }}>Contact</div>
          <div style={{ ...th, ...cell }}>Programme</div>
          <div style={{ ...th, ...cell }}>Form</div>
        </div>

        {shown.length === 0 ? (
          <div style={{ padding: 28, font: `500 13px ${SANS}`, color: "#5b6e82", textAlign: "center" }}>
            No enquiries match these filters.
          </div>
        ) : (
          shown.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpen(r)}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 12,
                width: "100%",
                padding: "14px 20px",
                border: "none",
                borderBottom: "1px solid var(--line)",
                background: "#fff",
                textAlign: "left",
                cursor: "pointer",
                alignItems: "start",
              }}
            >
              <div style={{ ...cell, font: `500 12px/1.5 ${SANS}`, color: "#5b6e82" }}>{when(r.created_at)}</div>
              <div style={cell}>
                <div style={{ font: `700 13px ${SANS}`, color: "#0a1b33", overflowWrap: "anywhere" }}>{r.name}</div>
                {r.organization && <div style={{ font: `500 11.5px ${SANS}`, color: "#8296a9", marginTop: 2, overflowWrap: "anywhere" }}>{r.organization}</div>}
              </div>
              <div style={{ ...cell, font: `500 12px/1.6 ${SANS}`, color: "#3d5064" }}>
                <div style={clip}>{r.email}</div>
                {r.phone && <div style={{ ...clip, color: "#8296a9" }}>{r.phone}</div>}
              </div>
              <div style={{ ...cell, font: `500 12px/1.5 ${SANS}`, color: "#3d5064" }}>
                {r.intent ? <div style={clip}>{r.intent}</div> : <span style={{ color: "#a9b8c6" }}>—</span>}
                {r.message && (
                  <div style={{ ...clip, color: "#8296a9", marginTop: 3 }}>
                    {r.message}
                  </div>
                )}
              </div>
              <div style={{ ...cell, justifySelf: "start" }}><Pill tone={FORM_TONE[r.form] ?? "neutral"}>{FORM_LABEL[r.form] ?? r.form}</Pill></div>
            </button>
          ))
        )}
      </div>

      {/* ---------------------------------------------------------- detail */}
      {open && (
        <Modal title={open.name} sub={`${FORM_LABEL[open.form] ?? open.form} · ${when(open.created_at)}`} onClose={() => setOpen(null)} width={620}>
          <dl style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "10px 16px", margin: 0 }}>
            {([
              ["Email", open.email],
              ["Phone", open.phone],
              ["Organisation", open.organization],
              ["Programme", open.intent],
              ["Participants", open.participants],
              ["Preferred mode", open.mode],
              ["Page", open.page],
            ] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt style={{ ...label, marginBottom: 0, paddingTop: 2 }}>{k}</dt>
                <dd style={{ margin: 0, font: `500 13px/1.6 ${SANS}`, color: "#0a1b33", wordBreak: "break-word" }}>{v}</dd>
              </div>
            ))}
          </dl>
          {open.message && (
            <div>
              <div style={label}>Message</div>
              <div style={{ background: "#f7fafc", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", font: `400 13px/1.7 ${SANS}`, color: "#3d5064", whiteSpace: "pre-wrap" }}>
                {open.message}
              </div>
            </div>
          )}
          <ModalActions>
            <button type="button" onClick={() => remove(open)} style={{ cursor: "pointer", border: "1px solid #f2c9c2", background: "#fff", color: "#a53f28", borderRadius: 8, padding: "10px 16px", font: `700 12.5px ${SANS}`, marginRight: "auto" }}>
              Delete
            </button>
            {open.email && (
              <a href={`mailto:${open.email}`} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 16px", font: `700 12.5px ${SANS}`, color: "#0a1b33", textDecoration: "none" }}>
                Reply by email
              </a>
            )}
            {open.phone && (
              <a href={`https://wa.me/${open.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ borderRadius: 8, padding: "10px 16px", font: `700 12.5px ${SANS}`, color: "#fff", background: "#1b8f88", textDecoration: "none" }}>
                WhatsApp
              </a>
            )}
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
