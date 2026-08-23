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
