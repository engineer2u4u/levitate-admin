"use client";

import { useState } from "react";
import { coursesFor, removeFacilitator } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import { initials } from "@/lib/format";
import type { Facilitator } from "@/lib/types";
import FacilitatorModal from "./FacilitatorModal";
import { EmptyState, card } from "./ui";
import { useToast } from "./AdminShell";
import { useCanWrite } from "./AuthGate";

export default function FacilitatorsView() {
  const data = useAdminData();
  const toast = useToast();
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<Facilitator | "new" | null>(null);

  const onDelete = (f: Facilitator) => {
    const { blocked } = removeFacilitator(f.id);
    if (blocked.length) {
      // Naming the courses is the difference between a dead end and a next
      // step — they have to be reassigned before this can go.
      toast(`${f.name} still leads ${blocked.length === 1 ? blocked[0] : `${blocked.length} courses`}`);
      return;
    }
    toast("Facilitator removed");
  };

  return (
    <div style={{ padding: "22px 26px 60px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ font: "500 11.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
          {data.facilitators.length} facilitator{data.facilitators.length === 1 ? "" : "s"}
        </div>
        {canWrite && <button type="button" className="btn btn-dark" onClick={() => setEditing("new")}>+ New facilitator</button>}
      </div>

      {data.facilitators.length === 0 ? (
        <EmptyState
          title="No facilitators yet"
          body={canWrite
            ? "Add the people who teach. Once they are here, a course picks one from a list rather than repeating their name — so correcting a spelling or swapping a photo updates every course at once."
            : "Nobody has been added yet. An admin creates facilitators; you will see them here once they do."}
          action={canWrite ? <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>Add the first facilitator</button> : undefined}
        />
      ) : (
        <div className="course-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
          {data.facilitators.map((f) => {
            const courses = coursesFor(data, f.id);
            return (
              <div key={f.id} style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                  {f.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.imageUrl} alt="" style={{ width: 58, height: 58, flex: "none", borderRadius: 10, objectFit: "cover", background: "var(--surface)" }} />
                  ) : (
                    <div aria-hidden style={{ width: 58, height: 58, flex: "none", borderRadius: 10, background: "var(--grad)", color: "#fff", font: "700 17px 'Plus Jakarta Sans',sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {initials(f.name)}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 15px/1.25 'Plus Jakarta Sans',sans-serif", color: "var(--ink)" }}>{f.name}</div>
                    <div style={{ font: "700 10px 'Plus Jakarta Sans',sans-serif", color: "var(--teal)", letterSpacing: ".11em", textTransform: "uppercase", marginTop: 5 }}>
                      {f.title}
                    </div>
                  </div>
                </div>

                {f.description && (
                  <div style={{ font: "400 11.5px/1.65 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>{f.description}</div>
                )}

                <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 11, font: "600 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--body)" }}>
                  {courses.length === 0
                    ? "Not on any course yet"
                    : `Leads ${courses.map((c) => c.title).join(" · ")}`}
                </div>

                {canWrite && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing(f)}>Edit</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (courses.length === 0 && !confirm(`Remove ${f.name}?`)) return;
                        onDelete(f);
                      }}
                      style={{ cursor: "pointer", border: "none", background: "none", font: "700 10.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)", padding: "0 4px" }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <FacilitatorModal facilitator={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
