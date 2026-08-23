"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAdminData } from "@/lib/useStore";
import EnrolModal from "./EnrolModal";

/* ------------------------------ toast ------------------------------ */

const ToastCtx = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

/* ---------------------- "enrol a customer" ------------------------- */

type EnrolPrefill = { courseId?: string; sessionId?: string } | null;
const EnrolCtx = createContext<(prefill?: EnrolPrefill) => void>(() => {});
export const useEnrolDialog = () => useContext(EnrolCtx);

const NAV = [
  { href: "/enrolments", label: "Enrolments" },
  { href: "/courses", label: "Courses" },
  { href: "/sessions", label: "Sessions" },
] as const;

const TITLES: Record<string, [string, string]> = {
  "/enrolments": ["Enrolments", "Who is enrolled, and what they owe"],
  "/courses": ["Courses", "Create and maintain the course catalogue"],
  "/sessions": ["Sessions", "Scheduled dates for each course"],
};

export default function AdminShell({ children }: { children: ReactNode }) {
  const data = useAdminData();
  const pathname = usePathname() ?? "/enrolments";
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [enrolOpen, setEnrolOpen] = useState<EnrolPrefill>(null);
  const [enrolKey, setEnrolKey] = useState(0);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToast({ id, message });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2800);
  }, []);

  // Remounting on each open guarantees the form starts clean.
  const openEnrol = useCallback((prefill?: EnrolPrefill) => {
    setEnrolKey((k) => k + 1);
    setEnrolOpen(prefill ?? {});
  }, []);

  const key = Object.keys(TITLES).find((k) => pathname.startsWith(k)) ?? "/enrolments";
  const [title, sub] = TITLES[key];
  const unpaid = data.enrolments.filter((e) => !e.paid).length;

  const toastValue = useMemo(() => showToast, [showToast]);
  const enrolValue = useMemo(() => openEnrol, [openEnrol]);

  return (
    <ToastCtx.Provider value={toastValue}>
      <EnrolCtx.Provider value={enrolValue}>
        <div className="admin-shell" style={{ display: "grid", gridTemplateColumns: "210px 1fr", minHeight: "100vh", alignItems: "start" }}>
          {/* sidebar */}
          <div className="admin-side" style={{ background: "var(--navy)", minHeight: "100vh", position: "sticky", top: 0, padding: "18px 14px", display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px" }}>
              <div style={{ background: "#fff", borderRadius: 7, padding: "5px 8px", display: "flex", flex: "none" }}>
                <span style={{ font: "800 12px 'Plus Jakarta Sans',sans-serif", color: "#0a1b33", letterSpacing: "-.02em" }}>LP</span>
              </div>
              <div>
                <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "#fff" }}>LMS Admin</div>
                <div style={{ font: "600 9.5px 'Plus Jakarta Sans',sans-serif", color: "#7fe3dc", letterSpacing: ".1em", textTransform: "uppercase" }}>Levitate</div>
              </div>
            </div>

            <nav className="admin-nav" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {NAV.map((n) => {
                const on = pathname.startsWith(n.href);
                const badge = n.href === "/enrolments" ? data.enrolments.length : n.href === "/courses" ? data.courses.length : data.sessions.length;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="nav-item"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 9, background: on ? "rgba(47,196,188,.16)" : "transparent", font: "600 12.5px 'Plus Jakarta Sans',sans-serif", color: on ? "#fff" : "rgba(255,255,255,.62)", whiteSpace: "nowrap" }}
                  >
                    <span>{n.label}</span>
                    <span style={{ background: "rgba(255,255,255,.14)", color: "#7fe3dc", font: "800 9.5px 'Plus Jakarta Sans',sans-serif", padding: "2px 7px", borderRadius: 999 }}>{badge}</span>
                  </Link>
                );
              })}
            </nav>

            <button type="button" onClick={() => openEnrol()} className="admin-cta" style={{ cursor: "pointer", border: "none", textAlign: "left", background: "var(--grad)", borderRadius: 10, padding: "12px 13px" }}>
              <div style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", color: "#fff" }}>+ Enrol a customer</div>
              <div style={{ font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "rgba(255,255,255,.8)", marginTop: 3 }}>Phone or email enquiry</div>
            </button>

            <div className="admin-side-foot" style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 14 }}>
              <a href="https://levitatepeoplesoft.com" target="_blank" rel="noopener noreferrer" style={{ display: "block", font: "600 11.5px 'Plus Jakarta Sans',sans-serif", color: "rgba(255,255,255,.55)", padding: "6px 12px" }}>
                Website ↗
              </a>
            </div>
          </div>

          {/* content */}
          <div style={{ minWidth: 0 }}>
            <div style={{ background: "#fff", borderBottom: "1px solid var(--line)", padding: "14px 26px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, position: "sticky", top: 0, zIndex: 20 }}>
              <div>
                <h1 style={{ font: "700 16px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)", margin: 0 }}>{title}</h1>
                <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", marginTop: 2 }}>{sub}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                {unpaid > 0 && (
                  <span style={{ font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "#9a6a12", background: "#fdf4e3", border: "1px solid #f0dcae", borderRadius: 999, padding: "6px 11px", whiteSpace: "nowrap" }}>
                    {unpaid} awaiting payment
                  </span>
                )}
                <div style={{ textAlign: "right" }}>
                  <div style={{ font: "700 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>Parichita Kotnala</div>
                  <div style={{ font: "500 10px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>Administrator</div>
                </div>
                <div aria-hidden style={{ width: 31, height: 31, borderRadius: 8, background: "var(--grad)", color: "#fff", font: "700 11px 'Plus Jakarta Sans',sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>PK</div>
              </div>
            </div>

            {children}
          </div>
        </div>

        {enrolOpen && (
          <EnrolModal key={enrolKey} prefill={enrolOpen} onClose={() => setEnrolOpen(null)} />
        )}

        {toast && (
          <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", background: "var(--navy)", color: "#fff", borderRadius: 10, padding: "12px 18px", font: "600 12px 'Plus Jakarta Sans',sans-serif", boxShadow: "0 14px 34px rgba(10,31,56,.28)", zIndex: 80, animation: "toastIn .22s ease both" }}>
            {toast.message}
          </div>
        )}
      </EnrolCtx.Provider>
    </ToastCtx.Provider>
  );
}
