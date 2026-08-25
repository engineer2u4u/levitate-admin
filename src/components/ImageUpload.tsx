"use client";

import { useRef, useState } from "react";
import { deleteImage, uploadImage } from "@/lib/storage";

type Size = { w: number; h: number; label: string };

/**
 * Pick an image, upload it, show it back.
 *
 * The recommended size is advice, not a rule — an off-size image uploads
 * fine, it just crops less predictably on the learner site. Saying the number
 * up front is what stops people guessing.
 *
 * Replacing an image deletes the one it replaces: the bucket is not a version
 * history, and orphaned files are nobody's job to find later.
 */
export default function ImageUpload({
  value,
  onChange,
  folder,
  size,
  label = "Image",
}: {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  size: Size;
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
    const res = await uploadImage(file, folder);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChange(res.url);
    if (previous) void deleteImage(previous);
  };

  const clear = () => {
    const previous = value;
    onChange("");
    setError("");
    if (previous) void deleteImage(previous);
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
          padding: value ? 0 : "18px 14px",
          background: value ? "#fff" : "var(--surface)",
          overflow: "hidden",
        }}
      >
        {value ? (
          <div>
            {/* Plain img: the export is unoptimised and these are remote
                Supabase URLs, so next/image would add config for no gain. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              style={{ display: "block", width: "100%", aspectRatio: `${size.w} / ${size.h}`, objectFit: "cover", background: "var(--surface)" }}
            />
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 12px", borderTop: "1px solid var(--line-soft)" }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)" }}
              >
                {busy ? "Uploading…" : "Replace"}
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={busy}
                style={{ cursor: "pointer", border: "none", background: "none", padding: 0, font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}
              >
                Remove
              </button>
            </div>
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
              {busy ? "Uploading…" : "Upload an image"}
            </button>
            <div style={{ font: "500 10.5px/1.6 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 8 }}>
              Recommended <strong style={{ color: "var(--body)" }}>{size.label}</strong> · JPEG, PNG or WebP · up to 5 MB
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
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
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
