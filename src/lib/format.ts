/** ₹ from paise. Money is stored as integer paise so no float ever rounds. */
export const inr = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");

/** Parse a rupee string from a form field into paise. Returns null if unusable. */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const paiseToRupees = (paise: number) => String(Math.round(paise / 100));

export const initials = (name: string) =>
  name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-10-03" → "Sat 3 Oct 2026", the way the website prints a session.
 *
 * Built by hand rather than with toLocaleDateString: browsers disagree on
 * whether September is "Sep" or "Sept", and the label is stored, so it has to
 * come out the same whoever saves it. Worked in UTC so no time zone can move
 * the day. "" for anything that is not a real date.
 */
export function dateLabel(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS[weekday]} ${d} ${MONTHS[mo - 1]} ${y}`;
}

/** India has no daylight saving, so IST is always UTC+5:30. */
const IST_OFFSET_MS = 330 * 60_000;

/** A day and an "HH:MM" wall-clock time in India, as a timestamptz literal. */
export const istTimestamp = (isoDate: string, hhmm: string) => `${isoDate}T${hhmm.slice(0, 5)}:00+05:30`;

/** A stored timestamp as "HH:MM" in India, for a time input. "" for none. */
export function istTime(timestamp: string | null): string {
  if (!timestamp) return "";
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms + IST_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
