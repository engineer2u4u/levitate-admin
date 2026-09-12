"use client";

import { loadCatalog, type CatalogStatus } from "@/lib/store";
import { card } from "./ui";

/**
 * What a screen shows in place of its list while courses and sessions are
 * still on their way from the database, or when they could not be read.
 *
 * Without it an empty list flashes first — and "No courses yet" is a claim
 * about a catalogue the screen has not actually checked.
 */
export default function CatalogState({ status, what }: { status: CatalogStatus; what: string }) {
  if (status.state === "error") {
    return (
      <div style={{ ...card, padding: 24 }}>
        <div style={{ font: "700 15px 'Plus Jakarta Sans',sans-serif", color: "#0a1b33", marginBottom: 6 }}>
          Could not load {what}
        </div>
        <div style={{ font: "400 13.5px/1.7 'Plus Jakarta Sans',sans-serif", color: "#5b6e82", marginBottom: 14 }}>{status.error}</div>
        <button type="button" className="btn btn-ghost" onClick={() => void loadCatalog()}>Try again</button>
      </div>
    );
  }
  return (
    <div style={{ ...card, padding: 24, font: "500 12.5px 'Plus Jakarta Sans',sans-serif", color: "#5b6e82" }}>
      Loading {what}…
    </div>
  );
}
