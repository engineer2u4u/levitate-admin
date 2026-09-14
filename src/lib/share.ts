import type { Batch, Course, Enrolment, Session } from "./types";

/**
 * The messages an admin forwards to someone they enrolled: the payment link
 * while payment is pending, and a welcome once it is confirmed. Both go out
 * from the admin's own WhatsApp or mail app — nothing is sent from here, the
 * links only open a prefilled message for them to check and send.
 */

/** Where learners sign up. Enrolling someone here does not create an account;
 *  they sign up there and enter their enrolment code, and the course appears. */
// The dashboard, not the catalogue: it is where the enrolment-code box is, and
// production builds keep the LMS out of the site's navigation.
export const LMS_URL = "https://levitatepeoplesoft.com/lms/dashboard/";

/** Digits for wa.me, which wants a country code and nothing else. A ten-digit
 *  number is taken to be an Indian mobile. */
export function whatsappNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
}

type Context = { enrolment: Enrolment; course: Course | undefined; batch: Batch | undefined; firstSession: Session | undefined };

export type ShareKind = "payment" | "welcome";

/** Payment while there is a link to pay and nothing paid; welcome otherwise. */
export const shareKindFor = (e: Enrolment): ShareKind => (e.status !== "paid" && e.paymentLink ? "payment" : "welcome");

function parts({ enrolment, course, batch, firstSession }: Context) {
  const first = enrolment.name.trim().split(/\s+/)[0] || "there";
  const courseName = course?.title ?? "your course";
  const batchName = batch ? `${batch.name} batch` : "the next batch";
  const starts = firstSession?.date ? `, starting ${firstSession.date}${firstSession.time ? ` (${firstSession.time})` : ""}` : "";
  return { first, courseName, batchName, starts };
}

export function shareText(kind: ShareKind, ctx: Context): { subject: string; body: string } {
  const { first, courseName, batchName, starts } = parts(ctx);
  const short = ctx.course?.short || courseName;
  // The code is what attaches the enrolment to their account. Until the
  // database has assigned one (migration 0017), fall back to the email.
  const code = ctx.enrolment.claimCode;
  const signUp = code
    ? `To start, sign up at ${LMS_URL} and enter your enrolment code:\n\n${code}\n\nYour course will then appear in your account. Please keep this code private — it can only be used once.`
    : `To start, sign up at ${LMS_URL} using this email address (${ctx.enrolment.email}).`;

  if (kind === "payment") {
    return {
      subject: `Payment link: ${short} — ${ctx.batch?.name ?? "enrolment"}`,
      body: [
        `Hi ${first},`,
        ``,
        `Thank you for choosing ${courseName} — ${batchName}${starts}.`,
        ``,
        `Please complete your payment here to confirm your seat:`,
        ctx.enrolment.paymentLink,
        ``,
        `Once your payment is confirmed, you will get access to the course.`,
        ``,
        signUp,
        ``,
        `Warm regards,`,
        `Levitate PeopleSoft`,
      ].join("\n"),
    };
  }
  return {
    subject: `You're enrolled: ${short} — ${ctx.batch?.name ?? "welcome"}`,
    body: [
      `Hi ${first},`,
      ``,
      `Your seat in ${courseName} — ${batchName}${starts} is confirmed.`,
      ``,
      signUp,
      ``,
      `Warm regards,`,
      `Levitate PeopleSoft`,
    ].join("\n"),
  };
}

export function whatsappUrl(kind: ShareKind, ctx: Context): string | null {
  const number = whatsappNumber(ctx.enrolment.phone);
  if (!number) return null;
  const { body } = shareText(kind, ctx);
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}

export function mailtoUrl(kind: ShareKind, ctx: Context): string | null {
  if (!ctx.enrolment.email) return null;
  const { subject, body } = shareText(kind, ctx);
  return `mailto:${ctx.enrolment.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
