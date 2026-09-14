import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE_PATH } from "./basePath";
import type {
  Batch,
  BatchInput,
  Course,
  CourseInput,
  Enrolment,
  EnrolmentInput,
  Module,
  Session,
  SessionInput,
  SessionLink,
} from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True once a project is configured at build time. */
export const supabaseConfigured = Boolean(URL && ANON);

/**
 * The client is imported lazily so the SDK is only fetched when a project is
 * actually configured — an unconfigured build should not pay for it.
 */
let clientPromise: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  if (!supabaseConfigured) {
    return Promise.reject(new Error("Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  }
  clientPromise ??= import("@supabase/supabase-js").then((m) =>
    m.createClient(URL, ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Invite and sign-in links arrive with the session in the URL; this is
        // what reads it and cleans the address bar.
        detectSessionInUrl: true,
        // Implicit, not PKCE, on purpose. PKCE keeps a verifier in the browser
        // that requested the link, so a link opened on a phone when it was
        // requested on a laptop would fail — which is exactly how invites get
        // opened.
        flowType: "implicit",
      },
    }),
  );
  return clientPromise;
}

/**
 * Where an emailed link should land — always this admin portal, never the
 * learner site, even though both share one Supabase project.
 *
 * The base path matters more than it looks. The admin lives in a folder of the
 * main site, so the bare origin is the *public website* — an invite built from
 * `location.origin` alone would drop the new admin on the marketing homepage.
 *
 * Set `NEXT_PUBLIC_ADMIN_URL` only when invites are sent from a different
 * hostname than the one the admin is served on.
 */
export function adminUrl(path = ""): string {
  const configured = process.env.NEXT_PUBLIC_ADMIN_URL?.trim();
  const base = configured
    ? configured.replace(/\/+$/, "") + "/"
    : typeof window !== "undefined"
      ? window.location.origin + BASE_PATH + "/"
      : "";
  return base + path;
}

/**
 * The page an emailed link opens.
 *
 * Deliberately not `/`, which only exists to redirect: the session arrives in
 * the URL fragment, and a redirect on arrival can drop it before the client
 * has loaded and read it. Landing on a real page removes the race — and puts
 * the person on the screen they wanted anyway.
 */
export const LANDING = "enrolments/";

/* ---------------------------------------------------------------- mapping */

/**
 * Row shapes as they come back from Postgres (snake_case), and — below — the
 * one place they are turned into the admin's own types and back. A column
 * added to either table is added here and nowhere else.
 */
export type BatchJson = {
  show?: boolean; tag?: string; title?: string; short?: string; status_label?: string;
  rows?: { k?: string; v?: string }[]; fee_note?: string; cta?: string;
};

export type CourseRow = {
  id: string; slug: string; title: string; category: string; description: string;
  duration: string; price_paise: number; status: "draft" | "live" | "archived";
  tenure: string; facilitator_id: string; live_session_count: number;
  live_session_schedule: string; banner_url: string; brochure_url: string;
  modules: Module[] | null;
  short: string; tag: string; mode: string; site_status: "enrolling" | "waitlist";
  hidden: boolean; price_on_request: boolean; price_note: string;
  list_price_paise: number | null; modules_label: string; hours_label: string;
  facilitator_name: string; image: string; sort_order: number; starts_label: string;
  batch: BatchJson | null; created_at: string; updated_at: string;
};

export type SessionRow = {
  id: string; course_id: string; batch_id: string; starts_on: string | null; date_label: string;
  time_label: string; mode: string; trainer: string; seats: number;
  status: "draft" | "open" | "closed"; topic: string;
  starts_at: string | null; ends_at: string | null; created_at: string;
};

export type BatchDbRow = {
  id: string; course_id: string; name: string; code: string;
  starts_on: string | null; ends_on: string | null;
  status: Batch["status"]; enrolment_open: boolean; seats: number;
  completed_at: string | null; created_at: string; updated_at: string;
};

export type SessionLinkRow = {
  session_id: string; join_url: string; meeting_id: string; passcode: string; recording_url: string;
};

export type ModuleUnlockRow = {
  batch_id: string; module_id: string; unlocked_at: string; after_session_id: string | null;
};

export type EnrolmentRow = {
  id: string; user_id: string | null; claim_code: string | null; name: string; email: string; phone: string;
  course_id: string; batch_id: string; source: Enrolment["source"];
  amount_paise: number; seats: number; method: Enrolment["method"];
  status: Enrolment["status"]; payment_link: string;
  paid_at: string | null; cancelled_at: string | null; linked_at: string | null;
  completed_at: string | null; certificate_sent_at: string | null; toolkit_sent_at: string | null;
  notes: string; created_at: string;
};

/** What the admin writes: every column but the ones the database owns. The
 *  slug is written once, on insert, and is not part of an update. */
export type CourseWrite = Omit<CourseRow, "id" | "slug" | "created_at" | "updated_at">;
export type SessionWrite = Omit<SessionRow, "id" | "created_at">;
export type BatchWrite = Omit<BatchDbRow, "id" | "completed_at" | "created_at" | "updated_at">;
export type EnrolmentWrite = Pick<
  EnrolmentRow,
  "name" | "email" | "phone" | "batch_id" | "course_id" | "source" | "amount_paise" | "seats" | "method" | "status" | "payment_link" | "notes"
>;

export function courseFromRow(r: CourseRow): Course {
  const b = r.batch ?? {};
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category ?? "",
    description: r.description ?? "",
    duration: r.duration ?? "",
    pricePaise: r.price_paise ?? 0,
    status: r.status,
    tenure: r.tenure ?? "",
    facilitatorId: r.facilitator_id ?? "",
    liveSessionCount: r.live_session_count ?? 0,
    liveSessionSchedule: r.live_session_schedule ?? "",
    bannerUrl: r.banner_url ?? "",
    brochureUrl: r.brochure_url ?? "",
    // Only the course form writes this, but a hand edit in the dashboard could
    // leave it any shape at all, and every screen that counts modules would
    // throw on the first render.
    modules: (Array.isArray(r.modules) ? r.modules : []).map((m) => ({
      ...m,
      lessons: m.lessons ?? [],
      quiz: m.quiz ?? null,
    })),
    short: r.short ?? "",
    tag: r.tag ?? "",
    mode: r.mode ?? "",
    siteStatus: r.site_status ?? "waitlist",
    hidden: r.hidden ?? false,
    priceOnRequest: r.price_on_request ?? false,
    priceNote: r.price_note ?? "",
    listPricePaise: r.list_price_paise ?? null,
    modulesLabel: r.modules_label ?? "",
    hoursLabel: r.hours_label ?? "",
    facilitatorName: r.facilitator_name ?? "",
    image: r.image ?? "",
    sortOrder: r.sort_order ?? 0,
    startsLabel: r.starts_label ?? "",
    // Rows the website does not list carry only `{"show": false}`.
    batch: {
      show: b.show === true,
      tag: b.tag ?? "",
      title: b.title ?? "",
      short: b.short ?? "",
      statusLabel: b.status_label ?? "",
      rows: (Array.isArray(b.rows) ? b.rows : []).map((row) => ({ k: row.k ?? "", v: row.v ?? "" })),
      feeNote: b.fee_note ?? "",
      cta: b.cta ?? "",
    },
    createdAt: r.created_at,
  };
}

export function courseToRow(c: CourseInput): CourseWrite {
  return {
    title: c.title,
    category: c.category,
    description: c.description,
    duration: c.duration,
    price_paise: c.pricePaise,
    status: c.status,
    tenure: c.tenure,
    facilitator_id: c.facilitatorId,
    live_session_count: c.liveSessionCount,
    live_session_schedule: c.liveSessionSchedule,
    banner_url: c.bannerUrl,
    brochure_url: c.brochureUrl,
    modules: c.modules,
    short: c.short,
    tag: c.tag,
    mode: c.mode,
    site_status: c.siteStatus,
    hidden: c.hidden,
    price_on_request: c.priceOnRequest,
    price_note: c.priceNote,
    list_price_paise: c.listPricePaise,
    modules_label: c.modulesLabel,
    hours_label: c.hoursLabel,
    facilitator_name: c.facilitatorName,
    image: c.image,
    sort_order: c.sortOrder,
    starts_label: c.startsLabel,
    batch: {
      show: c.batch.show,
      tag: c.batch.tag,
      title: c.batch.title,
      short: c.batch.short,
      status_label: c.batch.statusLabel,
      rows: c.batch.rows.map(({ k, v }) => ({ k, v })),
      fee_note: c.batch.feeNote,
      cta: c.batch.cta,
    },
  };
}

/** Which column each field of a course is written to. */
const COURSE_COLUMN: { [K in keyof CourseInput]: keyof CourseWrite } = {
  title: "title", category: "category", description: "description", duration: "duration",
  pricePaise: "price_paise", status: "status", tenure: "tenure", facilitatorId: "facilitator_id",
  liveSessionCount: "live_session_count", liveSessionSchedule: "live_session_schedule",
  bannerUrl: "banner_url", brochureUrl: "brochure_url", modules: "modules",
  short: "short", tag: "tag", mode: "mode",
  siteStatus: "site_status", hidden: "hidden", priceOnRequest: "price_on_request",
  priceNote: "price_note", listPricePaise: "list_price_paise", modulesLabel: "modules_label",
  hoursLabel: "hours_label", facilitatorName: "facilitator_name", image: "image",
  sortOrder: "sort_order", startsLabel: "starts_label", batch: "batch",
};

/**
 * Only the columns a patch changes. Archiving a course writes `status` and
 * nothing else, so it cannot put back a field another admin has just edited.
 */
export function coursePatchToRow(course: CourseInput, patch: Partial<CourseInput>): Partial<CourseWrite> {
  const row = courseToRow(course);
  const out: Partial<Record<keyof CourseWrite, unknown>> = {};
  for (const key of Object.keys(patch) as (keyof CourseInput)[]) {
    const column = COURSE_COLUMN[key];
    if (column) out[column] = row[column];
  }
  return out as Partial<CourseWrite>;
}

export function sessionFromRow(r: SessionRow): Session {
  return {
    id: r.id,
    courseId: r.course_id,
    batchId: r.batch_id,
    startsOn: r.starts_on ?? null,
    date: r.date_label ?? "",
    time: r.time_label ?? "",
    mode: r.mode ?? "",
    trainer: r.trainer ?? "",
    seats: r.seats,
    status: r.status,
    topic: r.topic ?? "",
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
    createdAt: r.created_at,
  };
}

export function sessionToRow(s: SessionInput): SessionWrite {
  return {
    course_id: s.courseId,
    batch_id: s.batchId,
    starts_on: s.startsOn,
    date_label: s.date,
    time_label: s.time,
    mode: s.mode,
    trainer: s.trainer,
    seats: s.seats,
    // Filling and Full are worked out from bookings and never stored.
    status: s.status === "draft" || s.status === "closed" ? s.status : "open",
    topic: s.topic,
    starts_at: s.startsAt,
    ends_at: s.endsAt,
  };
}

export function batchFromRow(r: BatchDbRow): Batch {
  return {
    id: r.id,
    courseId: r.course_id,
    name: r.name,
    code: r.code ?? "",
    startsOn: r.starts_on ?? null,
    endsOn: r.ends_on ?? null,
    status: r.status,
    enrolmentOpen: r.enrolment_open ?? true,
    seats: r.seats,
    completedAt: r.completed_at ?? null,
    createdAt: r.created_at,
  };
}

export function batchToRow(b: BatchInput): BatchWrite {
  return {
    course_id: b.courseId,
    name: b.name,
    code: b.code,
    starts_on: b.startsOn,
    ends_on: b.endsOn,
    status: b.status,
    enrolment_open: b.enrolmentOpen,
    seats: b.seats,
  };
}

export function sessionLinkFromRow(r: SessionLinkRow): SessionLink {
  return {
    sessionId: r.session_id,
    joinUrl: r.join_url ?? "",
    meetingId: r.meeting_id ?? "",
    passcode: r.passcode ?? "",
    recordingUrl: r.recording_url ?? "",
  };
}

export function sessionLinkToRow(l: SessionLink): SessionLinkRow {
  return {
    session_id: l.sessionId,
    join_url: l.joinUrl,
    meeting_id: l.meetingId,
    passcode: l.passcode,
    recording_url: l.recordingUrl,
  };
}

export function enrolmentFromRow(r: EnrolmentRow): Enrolment {
  return {
    id: r.id,
    userId: r.user_id ?? null,
    // Absent until migration 0017 has run.
    claimCode: r.claim_code ?? "",
    name: r.name,
    email: r.email ?? "",
    phone: r.phone ?? "",
    courseId: r.course_id,
    batchId: r.batch_id,
    source: r.source,
    amountPaise: r.amount_paise ?? 0,
    seats: r.seats ?? 1,
    method: r.method,
    status: r.status,
    paymentLink: r.payment_link ?? "",
    paidAt: r.paid_at ?? null,
    cancelledAt: r.cancelled_at ?? null,
    linkedAt: r.linked_at ?? null,
    completedAt: r.completed_at ?? null,
    certificateSentAt: r.certificate_sent_at ?? null,
    toolkitSentAt: r.toolkit_sent_at ?? null,
    notes: r.notes ?? "",
    createdAt: r.created_at,
  };
}

export function enrolmentToRow(e: EnrolmentInput): EnrolmentWrite {
  return {
    name: e.name,
    email: e.email,
    phone: e.phone,
    batch_id: e.batchId,
    course_id: e.courseId,
    source: e.source,
    amount_paise: e.amountPaise,
    seats: e.seats,
    method: e.method,
    status: e.status,
    payment_link: e.paymentLink,
    notes: e.notes,
  };
}
