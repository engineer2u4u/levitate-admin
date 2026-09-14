"use client";

import { useEffect, useRef, useState } from "react";
import {
  CANVASES,
  LOCAL_PLATES,
  downloadBlob,
  fileStem,
  plateExists,
  sampleMaskColors,
  suggestId,
  svgToPng,
  today,
} from "@/lib/certificate";
import { useAdminData } from "@/lib/useStore";
import { CERTIFICATE_TEMPLATES, type CertificateIssue, type CertificateTemplate } from "@/lib/types";
import CertificateArt from "./CertificateArt";
import CertificateSettingsModal from "./CertificateSettingsModal";
import { Field, card, input } from "./ui";
import { useToast } from "./AdminShell";
import { useCanWrite } from "./AuthGate";

export default function CertificatesView() {
  const data = useAdminData();
  const toast = useToast();
  const canWrite = useCanWrite();
  const svgRef = useRef<SVGSVGElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState("");

  const [issue, setIssue] = useState<CertificateIssue>({
    template: "excellence",
    recipientName: "",
    courseName: "",
    completedOn: today(),
    hours: "",
    pdcs: "",
    cpdHours: "",
    certificateId: suggestId(),
  });
  const set = <K extends keyof CertificateIssue>(key: K, value: CertificateIssue[K]) => {
    setIssue((i) => ({ ...i, [key]: value }));
  };

  /** Picking a course fills what the course already knows. */
  const pickCourse = (courseId: string) => {
    const course = data.courses.find((c) => c.id === courseId);
    if (!course) return;
    setIssue((i) => ({ ...i, courseName: course.title, hours: course.duration }));
  };

  const canvas = CANVASES[issue.template];

  // An uploaded plate wins; otherwise a file dropped into public/certificates/
  // is used if it is actually there. Probed rather than assumed, so a missing
  // file falls back to the drawn layout instead of rendering onto nothing.
  const uploaded = {
    shrm: data.certificate.shrmPlateUrl,
    excellence: data.certificate.excellencePlateUrl,
    cpd: data.certificate.cpdPlateUrl,
  }[issue.template];
  const portrait = canvas.h > canvas.w;
  const [localPlate, setLocalPlate] = useState("");
  useEffect(() => {
    let alive = true;
    const candidate = LOCAL_PLATES[issue.template];
    void plateExists(candidate).then((found) => {
      if (alive) setLocalPlate(found ? candidate : "");
    });
    return () => {
      alive = false;
    };
  }, [issue.template]);

  const plate = uploaded || localPlate;
  const hasPlate = Boolean(plate);

  // Read the plate's own colours behind each patch, so covering the specimen
  // text works over the blue panel as well as over white.
  const [maskColors, setMaskColors] = useState<Record<string, string>>({});
  useEffect(() => {
    // No plate means no patches are drawn, so stale colours are unreachable —
    // clearing them here would only be a synchronous setState in an effect.
    if (!plate) return;
    let alive = true;
    void sampleMaskColors(plate, issue.template, canvas).then((colors) => {
      if (alive) setMaskColors(colors);
    });
    return () => {
      alive = false;
    };
  }, [plate, issue.template, canvas]);

  const render = async (): Promise<Blob | null> => {
    if (!svgRef.current) return null;
    if (!issue.recipientName.trim()) {
      toast("Enter the recipient's name first");
      return null;
    }
    try {
      // The CPD plate is already print-size; 2.5× of it would be a 29-megapixel
      // canvas, past what some browsers will allocate.
      return await svgToPng(svgRef.current, canvas, issue.template === "cpd" ? 1.25 : 2.5);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The certificate could not be rendered");
      return null;
    }
  };

  const downloadPng = async () => {
    setBusy("png");
    const blob = await render();
    setBusy("");
    if (blob) downloadBlob(blob, `${fileStem(issue)}.png`);
  };

  const working = (key: string) => busy === key;

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
          Fill in the details, then print, download or send.
        </div>
        {canWrite && (
          <button type="button" className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
            Branding & signatures
          </button>
        )}
      </div>

      <div className="cert-layout" style={{ display: "grid", gridTemplateColumns: "330px 1fr", gap: 14, alignItems: "start" }}>
        {/* ------------------------------ form ------------------------------ */}
        <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 13 }}>
          <div>
            <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
              Format
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {CERTIFICATE_TEMPLATES.map((t) => {
                const on = issue.template === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set("template", t.key as CertificateTemplate)}
                    aria-pressed={on}
                    style={{ textAlign: "left", cursor: "pointer", background: on ? "#f2fbfa" : "#fff", border: `1px solid ${on ? "var(--teal)" : "var(--line)"}`, borderRadius: 10, padding: "10px 12px" }}
                  >
                    <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{t.label}</div>
                    <div style={{ font: "500 10.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{t.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Recipient name">
            <input value={issue.recipientName} onChange={(e) => set("recipientName", e.target.value)} placeholder="Ananya Rao" style={input} />
          </Field>

          <Field label="Course" hint="Pick one to fill the name and hours, or type your own below.">
            <select defaultValue="" onChange={(e) => pickCourse(e.target.value)} style={input}>
              <option value="">Choose a course…</option>
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>

          <Field label="Course name">
            <textarea
              value={issue.courseName}
              onChange={(e) => set("courseName", e.target.value)}
              rows={2}
              placeholder="Certified POSH & Workplace Dignity Facilitator Program"
              style={{ ...input, resize: "vertical", lineHeight: 1.5 }}
            />
          </Field>

          <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={issue.template === "cpd" ? "Date of CPD activity" : "Completed on"}>
              <input value={issue.completedOn} onChange={(e) => set("completedOn", e.target.value)} placeholder="18 Sep 2026" style={input} />
            </Field>
            {issue.template === "excellence" ? (
              <Field label="Hours">
                <input value={issue.hours} onChange={(e) => set("hours", e.target.value)} placeholder="12 Hours" style={input} />
              </Field>
            ) : issue.template === "cpd" ? (
              <Field label="CPD hours / points">
                <input value={issue.cpdHours} onChange={(e) => set("cpdHours", e.target.value)} placeholder="15" style={input} />
              </Field>
            ) : (
              <Field label="PDCs">
                <input value={issue.pdcs} onChange={(e) => set("pdcs", e.target.value)} placeholder="12" style={input} />
              </Field>
            )}
          </div>

          {issue.template === "excellence" && (
            <Field label="Certificate ID">
              <input value={issue.certificateId} onChange={(e) => set("certificateId", e.target.value)} placeholder="2026-09-001" style={input} />
            </Field>
          )}

          <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 13, display: "flex", flexDirection: "column", gap: 9 }}>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Download PDF
            </button>
            <div style={{ font: "500 10px/1.5 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: -3 }}>
              Opens your browser&rsquo;s print dialog — choose <strong style={{ color: "var(--body)" }}>Save as PDF</strong>. Prints as
              vectors, so the text stays sharp at any size.
            </div>
            <button type="button" className="btn btn-soft" onClick={() => void downloadPng()} disabled={Boolean(busy)}>
              {working("png") ? "Rendering…" : "Download PNG"}
            </button>
          </div>
        </div>

        {/* ---------------------------- preview ---------------------------- */}
        <div style={{ ...card, padding: 14, background: "#f4f7fa", display: "flex", flexDirection: "column", gap: 11 }}>
          {!hasPlate && canWrite && (
            <div style={{ font: "600 11px/1.65 'Plus Jakarta Sans',sans-serif", color: "#9a6a12", background: "#fdf4e3", border: "1px solid #f0dcae", borderRadius: 9, padding: "10px 12px" }}>
              No artwork found for this format, so this is the drawn stand-in rather than your design. Put the file in
              <strong> public/certificates/</strong>, or upload it under <strong>Branding &amp; signatures → Artwork plates</strong>.
            </div>
          )}
          {/* The page is sized to the artwork, so printing neither crops nor
              letterboxes it. Injected here because it varies per format. */}
          {/* On screen a portrait certificate is held to a readable width —
              full width it would stand taller than the window. Print is
              unaffected: its size comes from the page rule. */}
          <style>{`@media print { @page { size: ${canvas.pageMm.w}mm ${canvas.pageMm.h}mm; margin: 0; } .cert-print, .cert-print svg { width: ${canvas.pageMm.w}mm; height: ${canvas.pageMm.h}mm; } } @media screen { .cert-portrait { width: 100%; max-width: 560px; margin: 0 auto; } }`}</style>
          <div className={portrait ? "cert-print cert-portrait" : "cert-print"} style={{ background: "#fff", boxShadow: "0 10px 30px rgba(10,31,56,.13)" }}>
            <CertificateArt ref={svgRef} issue={issue} settings={data.certificate} plate={plate} maskColors={maskColors} />
          </div>
        </div>
      </div>

      {settingsOpen && (
        <CertificateSettingsModal settings={data.certificate} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
