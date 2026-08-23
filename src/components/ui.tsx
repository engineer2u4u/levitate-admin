"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";

export const label: CSSProperties = {
  font: "700 10px 'Plus Jakarta Sans',sans-serif",
  color: "var(--muted)",
  letterSpacing: ".1em",
  textTransform: "uppercase",
  marginBottom: 6,
};

export const input: CSSProperties = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "10px 12px",
  font: "500 12.5px 'Plus Jakarta Sans',sans-serif",
  color: "var(--ink)",
  background: "#fff",
};

export const card: CSSProperties = {
  background: "#fff",
  border: "1px solid var(--line)",
  borderRadius: 12,
};

export const th: CSSProperties = {
  font: "700 9.5px 'Plus Jakarta Sans',sans-serif",
  color: "var(--muted)",
  letterSpacing: ".1em",
  textTransform: "uppercase",
  textAlign: "left",
};

/** Coloured status pill. */
export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const tones = {
    good: { color: "#136f6a", background: "#eafaf8" },
    warn: { color: "#9a6a12", background: "#fdf4e3" },
    bad: { color: "#9a2c2c", background: "#fdeceb" },
    neutral: { color: "#5b6b7c", background: "#eef2f6" },
  } as const;
  return (
    <span style={{ ...tones[tone], font: "800 9.5px 'Plus Jakarta Sans',sans-serif", borderRadius: 999, padding: "4px 9px", whiteSpace: "nowrap", display: "inline-block" }}>
      {children}
    </span>
  );
}

export function Field({ label: text, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <div style={label}>{text}</div>
      {children}
      {error ? (
        <div role="alert" style={{ font: "600 10.5px 'Plus Jakarta Sans',sans-serif", color: "#9a2c2c", marginTop: 5 }}>{error}</div>
      ) : hint ? (
        <div style={{ font: "500 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 5 }}>{hint}</div>
      ) : null}
    </div>
  );
}

/** Modal shell — Escape closes, backdrop closes, background scroll locks. */
export function Modal({ title, sub, onClose, children, width = 560 }: { title: string; sub?: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, background: "rgba(10,27,51,.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }}>
      <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", inset: 0, border: "none", background: "transparent", cursor: "pointer", padding: 0 }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "88vh", overflow: "auto", boxShadow: "0 26px 70px rgba(10,27,51,.32)", animation: "modalIn .2s ease both" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div>
            <div style={{ font: "700 17px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{title}</div>
            {sub && <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 3 }}>{sub}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ cursor: "pointer", border: "none", background: "transparent", font: "600 18px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>{children}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div style={{ ...card, padding: "44px 34px", textAlign: "center" }}>
      <div style={{ font: "700 16px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", marginBottom: 7 }}>{title}</div>
      <p style={{ font: "400 13px/1.7 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", margin: "0 auto 18px", maxWidth: 420 }}>{body}</p>
      {action}
    </div>
  );
}
