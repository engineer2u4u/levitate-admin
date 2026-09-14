"use client";

import { useRef, useState } from "react";
import { deleteUpload, uploadBrochure } from "@/lib/storage";

/**
 * Pick a brochure PDF, upload it, show it back.
 *
 * A PDF has no thumbnail worth showing, so what it shows instead is proof the
 * right file is attached: a link that opens it. Replacing one deletes the file
 * it replaces, as with imagery — the bucket is not a version history.
 */
export default function BrochureUpload({
  value,
  onChange,
  label = "Brochure",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    const previous = value;
    const res = await uploadBrochure(file, "brochures");
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChange(res.url);
    if (previous) void deleteUpload(previous);
  };

  const clear = () => {
    const previous = value;
    onChange("");
    setError("");
    if (previous) void deleteUpload(previous);
  };

  return (
    <div>
      <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>

      <div
        style={{
          border: `1px ${value ? "solid" : "dashed"} var(--line)`,
          borderRadius: 10,
          padding: value ? "11px 13px" : "18px 14px",
          background: value ? "#fff" : "var(--surface)",
        }}
      >
        {value ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div aria-hidden style={{ flex: "none", width: 30, height: 36, borderRadius: 5, background: "#fdecea", border: "1px solid #f6d3cd", display: "grid", placeItems: "center", font: "700 8.5px 'Plus Jakarta Sans',sans-serif", color: "#a53f28" }}>
              PDF
            </div>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, minWidth: 0, font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {fileName(value)}
              <span style={{ display: "block", font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)", marginTop: 2 }}>
                Open in a new tab
              </span>
            </a>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              style={{ flex: "none", cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)" }}
            >
              {busy ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              style={{ flex: "none", cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              style={{ background: "#fff" }}
            >
              {busy ? "Uploading…" : "Upload a brochure"}
            </button>
            <div style={{ font: "500 10.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 8 }}>
              PDF · up to 5 MB · offered as a download on the course page
            </div>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" style={{ font: "600 10.5px/1.5 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", marginTop: 6 }}>
          {error}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          // Reset, or picking the same file twice in a row fires nothing.
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
    </div>
  );
}

/** The stored name, which is randomised — enough to tell two uploads apart. */
const fileName = (url: string) => decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "Brochure.pdf");
