import { getClient, supabaseConfigured } from "./supabase";

/**
 * Website enquiries, as the learner site writes them.
 *
 * Read straight from Supabase like learner progress: the site is the only
 * writer, so a browser-local copy here would be a copy of nothing. RLS lets an
 * admin's token read every row and nobody else's read any.
 */
export type EnquiryForm = "popup" | "contact" | "service" | "kit" | "masterclass" | "other";

export type Enquiry = {
  id: string;
  created_at: string;
  form: EnquiryForm;
  name: string;
  email: string;
  phone: string;
  organization: string;
  intent: string;
  participants: string;
  mode: string;
  message: string;
  page: string;
  /*
   * Where the visitor came from (migration 0016). Optional: absent before the
   * migration has run, and '' on enquiries received before tracking began.
   */
  /** The most recent visit that had a source — see CHANNEL_LABEL. */
  channel?: string;
  /** The visit that introduced them. */
  first_channel?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
  landing_page?: string;
};

export const FORM_LABEL: Record<EnquiryForm, string> = {
  popup: "Pop-up",
  contact: "Contact page",
  service: "Service page",
  kit: "Kit download",
  masterclass: "Masterclass (paid)",
  other: "Other",
};

/** The website's channel keys (lib/attribution.ts there), in filter order. */
export const CHANNEL_LABEL: Record<string, string> = {
  google_ads: "Google Ads",
  google_search: "Google search",
  meta_ads: "Meta Ads",
  meta: "Facebook / Instagram",
  direct: "Direct",
  other_search: "Other search engine",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  email: "Email",
  campaign: "Other campaign",
  referral: "Other website",
};

/** "Not recorded" for enquiries from before tracking; an unknown key as itself. */
export const channelLabel = (key: string | undefined) => (key ? CHANNEL_LABEL[key] ?? key : "Not recorded");

/** PostgREST caps a response at 1,000 rows; page until a short page arrives. */
const PAGE = 1000;

export async function listEnquiries(): Promise<Enquiry[]> {
  if (!supabaseConfigured) {
    throw new Error("Supabase is not configured, so there are no enquiries to read.");
  }
  const supabase = await getClient();
  const rows: Enquiry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("enquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        throw new Error(
          "The enquiries table has not been created yet. Run migration 0005_enquiries.sql in the Supabase SQL editor, then reload.",
        );
      }
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as Enquiry[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function deleteEnquiry(id: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("enquiries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* -------------------------------------------------------------------- CSV */

/**
 * One CSV cell.
 *
 * Quoted and escaped as RFC 4180 asks — commas, quotes and line breaks all
 * turn up in real enquiries.
 *
 * And defused. These values were typed into a public form by anybody, and a
 * spreadsheet treats a cell beginning =, +, - or @ as a formula: an "enquiry"
 * whose name is =HYPERLINK(...) becomes a live link, or worse, the moment the
 * file is opened in Excel. A leading apostrophe makes it text again, and is
 * the fix the spreadsheet vendors themselves recommend.
 */
function cell(v: string): string {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

const COLUMNS: { head: string; get: (e: Enquiry) => string }[] = [
  { head: "Received", get: (e) => new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
  { head: "Form", get: (e) => FORM_LABEL[e.form] ?? e.form },
  { head: "Name", get: (e) => e.name },
  { head: "Email", get: (e) => e.email },
  { head: "Phone", get: (e) => e.phone },
  { head: "Organisation", get: (e) => e.organization },
  { head: "Programme / interest", get: (e) => e.intent },
  { head: "Participants", get: (e) => e.participants },
  { head: "Preferred mode", get: (e) => e.mode },
  { head: "Message", get: (e) => e.message },
  { head: "Page", get: (e) => e.page },
  { head: "Source", get: (e) => channelLabel(e.channel) },
  { head: "First source", get: (e) => (e.first_channel ? channelLabel(e.first_channel) : "") },
  { head: "Campaign", get: (e) => e.utm_campaign ?? "" },
  { head: "UTM source", get: (e) => e.utm_source ?? "" },
  { head: "UTM medium", get: (e) => e.utm_medium ?? "" },
  { head: "Keyword / term", get: (e) => e.utm_term ?? "" },
  { head: "Ad content", get: (e) => e.utm_content ?? "" },
  { head: "Referrer", get: (e) => e.referrer ?? "" },
  { head: "Landing page", get: (e) => e.landing_page ?? "" },
  { head: "Google click id", get: (e) => e.gclid ?? "" },
  { head: "Meta click id", get: (e) => e.fbclid ?? "" },
];

export function toCsv(rows: Enquiry[]): string {
  const lines = [COLUMNS.map((c) => cell(c.head)).join(",")];
  for (const r of rows) lines.push(COLUMNS.map((c) => cell(c.get(r))).join(","));
  // CRLF line endings and a byte-order mark: without the BOM, Excel opens a
  // UTF-8 file as Latin-1 and every non-ASCII name turns to mojibake.
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(rows: Enquiry[], filename: string) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
