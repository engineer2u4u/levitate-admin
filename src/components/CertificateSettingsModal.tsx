"use client";

import { useState } from "react";
import { updateCertificateSettings } from "@/lib/store";
import { IMAGE_SIZES, type CertificateSettings } from "@/lib/types";
import ImageUpload from "./ImageUpload";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

/**
 * The marks and signatures shared by every certificate.
 *
 * Separate from issuing one because this is set up once and then left alone —
 * mixing it into the issue form would put six uploads in front of someone who
 * only wants to type a name.
 */
export default function CertificateSettingsModal({
  settings,
  onClose,
}: {
  settings: CertificateSettings;
  onClose: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<CertificateSettings>(settings);
  const set = <K extends keyof CertificateSettings>(key: K, value: CertificateSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    updateCertificateSettings({
      ...draft,
      orgName: draft.orgName.trim() || "Levitate PeopleSoft",
      website: draft.website.trim(),
      primaryName: draft.primaryName.trim(),
      primaryTitle: draft.primaryTitle.trim(),
      secondName: draft.secondName.trim(),
      secondTitle: draft.secondTitle.trim(),
      closingNote: draft.closingNote.trim(),
      accreditationNote: draft.accreditationNote.trim(),
    });
    toast("Certificate branding saved");
    onClose();
  };

  return (
    <Modal
      title="Certificate branding"
      sub="Set once — every certificate you issue uses it"
      onClose={onClose}
      width={620}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Organisation">
            <input value={draft.orgName} onChange={(e) => set("orgName", e.target.value)} style={input} />
          </Field>
          <Field label="Website">
            <input value={draft.website} onChange={(e) => set("website", e.target.value)} placeholder="www.levitatepeoplesoft.com" style={input} />
          </Field>
        </div>

        <Section
          title="Artwork plates"
          sub="The finished design for each format. With one set, only the changing fields are drawn — which is the only way the output matches the design exactly."
        />

        <div style={{ font: "500 11px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--body)", background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: 9, padding: "11px 13px" }}>
          Export each certificate as a PNG or JPEG at full size, <strong>with the specimen text removed</strong> — no
          &ldquo;Your Name Here&rdquo;, no sample dates. Everything else stays: border, logos, seal, signatures, footer.
          <br />
          SHRM format <strong>1536 × 1024</strong> · Award format <strong>1600 × 900</strong>.
        </div>

        <ImageUpload
          label="SHRM format plate"
          value={draft.shrmPlateUrl}
          onChange={(url) => set("shrmPlateUrl", url)}
          folder="certificate"
          size={{ w: 1536, h: 1024, label: "1536 × 1024 px (3:2)" }}
        />
        <ImageUpload
          label="Award format plate"
          value={draft.excellencePlateUrl}
          onChange={(url) => set("excellencePlateUrl", url)}
          folder="certificate"
          size={{ w: 1600, h: 900, label: "1600 × 900 px (16:9)" }}
        />

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 13px" }}>
          <input
            type="checkbox"
            checked={draft.plateHasSampleText}
            onChange={(e) => set("plateHasSampleText", e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, flex: "none", accentColor: "#2fc4bc" }}
          />
          <span>
            <span style={{ display: "block", font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>
              My plates still have the specimen text on them
            </span>
            <span style={{ display: "block", font: "500 10.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 3 }}>
              Paints over each sample field before writing the real one. Works where the background is flat white — not over
              the blue panel, so a plate with a sample Certificate ID needs cleaning by hand.
            </span>
          </span>
        </label>

        <Section title="Signatories" sub="Printed only when no plate is set — a plate already carries them." />

        <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Name">
            <input value={draft.primaryName} onChange={(e) => set("primaryName", e.target.value)} placeholder="Parichita Kotnala" style={input} />
          </Field>
          <Field label="Title">
            <input value={draft.primaryTitle} onChange={(e) => set("primaryTitle", e.target.value)} placeholder="Trainer" style={input} />
          </Field>
        </div>
        <ImageUpload
          label="Signature"
          value={draft.primarySignatureUrl}
          onChange={(url) => set("primarySignatureUrl", url)}
          folder="certificate"
          size={IMAGE_SIZES.signature}
        />

        <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Second name">
            <input value={draft.secondName} onChange={(e) => set("secondName", e.target.value)} placeholder="RP Nath" style={input} />
          </Field>
          <Field label="Second title">
            <input value={draft.secondTitle} onChange={(e) => set("secondTitle", e.target.value)} placeholder="Principal Advisor" style={input} />
          </Field>
        </div>
        <ImageUpload
          label="Second signature"
          value={draft.secondSignatureUrl}
          onChange={(url) => set("secondSignatureUrl", url)}
          folder="certificate"
          size={IMAGE_SIZES.signature}
        />

        <Section title="Individual marks" sub="Used only by the drawn fallback, when no plate is set for that format." />

        <ImageUpload label="Logo — Award template" value={draft.logoUrl} onChange={(url) => set("logoUrl", url)} folder="certificate" size={IMAGE_SIZES.logo} />
        <ImageUpload label="Award seal" value={draft.sealUrl} onChange={(url) => set("sealUrl", url)} folder="certificate" size={IMAGE_SIZES.seal} />
        <ImageUpload label="“Recognised by” logo strip" value={draft.recognitionStripUrl} onChange={(url) => set("recognitionStripUrl", url)} folder="certificate" size={IMAGE_SIZES.strip} />
        <ImageUpload label="Accreditation badge — SHRM template" value={draft.accreditationLogoUrl} onChange={(url) => set("accreditationLogoUrl", url)} folder="certificate" size={IMAGE_SIZES.seal} />

        <ImageUpload
          label="Ornamental border — SHRM template"
          value={draft.borderUrl}
          onChange={(url) => set("borderUrl", url)}
          folder="certificate"
          size={IMAGE_SIZES.certBorder}
        />
        <div style={{ font: "500 10.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: -8 }}>
          A full-bleed background with the middle left blank. Without one, a plainer frame is drawn instead.
        </div>

        <Field label="Closing line — Award format" hint="Printed under the course title. Wrap a phrase in **asterisks** to set it bold, as the artwork does.">
          <textarea
            value={draft.closingNote}
            onChange={(e) => set("closingNote", e.target.value)}
            rows={2}
            placeholder="under the **Prevention of Sexual Harassment at Workplace** (POSH Act, 2013)."
            style={{ ...input, resize: "vertical", lineHeight: 1.6 }}
          />
        </Field>

        <Field label="Accreditation note" hint="Printed small along the bottom of the SHRM template.">
          <textarea
            value={draft.accreditationNote}
            onChange={(e) => set("accreditationNote", e.target.value)}
            rows={4}
            style={{ ...input, resize: "vertical", lineHeight: 1.7 }}
          />
        </Field>

        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save branding</button>
        </ModalActions>
      </div>
    </Modal>
  );
}

function Section({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 13 }}>
      <div style={{ font: "700 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{title}</div>
      <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}
