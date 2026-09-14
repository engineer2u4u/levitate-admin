"use client";

import { mailtoUrl, shareKindFor, shareText, whatsappUrl } from "@/lib/share";
import { sessionsOf } from "@/lib/store";
import { useAdminData } from "@/lib/useStore";
import type { Enrolment } from "@/lib/types";
import { useToast } from "./AdminShell";

const link = (color: string) =>
  ({
    cursor: "pointer",
    border: "none",
    background: "none",
    padding: 0,
    font: "700 10.5px 'Plus Jakarta Sans',sans-serif",
    color,
    textDecoration: "none",
    whiteSpace: "nowrap",
  }) as const;

/**
 * WhatsApp, email and copy for one enrolment: the payment link while payment
 * is pending, a welcome once it is paid. Each opens a prefilled message in the
 * admin's own app — nothing is sent until they press send there.
 *
 * `buttons` renders them as full buttons (the enrol dialog); otherwise as the
 * small text links a table row uses.
 */
export default function EnrolmentShare({ enrolment, buttons = false }: { enrolment: Enrolment; buttons?: boolean }) {
  const data = useAdminData();
  const toast = useToast();
  if (enrolment.status === "cancelled") return null;

  const ctx = {
    enrolment,
    course: data.courses.find((c) => c.id === enrolment.courseId),
    batch: data.batches.find((b) => b.id === enrolment.batchId),
    firstSession: sessionsOf(data, enrolment.batchId).find((s) => s.startsOn),
  };
  const kind = shareKindFor(enrolment);
  const wa = whatsappUrl(kind, ctx);
  const mail = mailtoUrl(kind, ctx);

  const copy = () => {
    const text = kind === "payment" ? enrolment.paymentLink : shareText(kind, ctx).body;
    void navigator.clipboard?.writeText(text).then(
      () => toast(kind === "payment" ? "Payment link copied" : "Message copied"),
      () => toast("Could not copy — select it and copy manually"),
    );
  };

  const title = kind === "payment" ? "payment link" : "welcome message";

  if (buttons) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ background: "#1faa59", textDecoration: "none" }}>
            WhatsApp {title}
          </a>
        )}
        {mail && (
          <a href={mail} className="btn btn-soft" style={{ textDecoration: "none" }}>
            Email {title}
          </a>
        )}
        <button type="button" className="btn btn-ghost" onClick={copy}>
          {kind === "payment" ? "Copy link" : "Copy message"}
        </button>
      </div>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp the ${title}`} style={link("#1b8f4c")}>WhatsApp</a>}
      {mail && <a href={mail} title={`Email the ${title}`} style={link("var(--teal)")}>Email</a>}
    </span>
  );
}
