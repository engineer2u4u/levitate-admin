import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminData,
  Batch,
  BatchInput,
  CertificateSettings,
  Course,
  CourseInput,
  Certificate,
  Enrolment,
  EnrolmentInput,
  EnrolmentStatus,
  Facilitator,
  LearnerProgress,
  LegacyEnrolment,
  LocalData,
  ModuleUnlock,
  Session,
  SessionInput,
  SessionLink,
} from "./types";
import { DEFAULT_CERTIFICATE } from "./certificate";
import {
  batchFromRow,
  batchToRow,
  courseFromRow,
  coursePatchToRow,
  certificateFromRow,
  enrolmentFromRow,
  enrolmentToRow,
  getClient,
  sessionFromRow,
  sessionLinkFromRow,
  sessionLinkToRow,
  sessionToRow,
  type BatchDbRow,
  type CertificateRow,
  type CourseRow,
  type EnrolmentRow,
  type ModuleUnlockRow,
  type SessionLinkRow,
  type SessionRow,
} from "./supabase";

/**
 * Persistence for the admin, in two halves.
 *
 * The database half is everything the website or learners also depend on:
 * courses, their batches and sessions, Zoom links, and enrolments. It loads
 * once a staff session exists (AuthGate asks for it), and every change is
 * shown first and written second: a write the database refuses is rolled back
 * and its reason handed to the caller to show.
 *
 * Facilitators and certificate settings are still localStorage — per-browser,
 * and shared with nobody. Screens read both halves as one `AdminData` snapshot
 * and never need to know which is which.
 */
const KEY = "lvt.admin.data.v1";

const listeners = new Set<() => void>();

export const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb) as unknown as void;
};

export const EMPTY: AdminData = {
  certificate: DEFAULT_CERTIFICATE,
  facilitators: [],
  courses: [],
  batches: [],
  sessions: [],
  sessionLinks: [],
  enrolments: [],
  moduleUnlocks: [],
  progress: [],
  certificates: [],
};

/** What a browser starts with: the certificate defaults and nothing else. */
const BLANK = (): LocalData => ({ certificate: DEFAULT_CERTIFICATE, facilitators: [] });

/** Where the database half stands. `idle` means nobody has asked yet. */
export type CatalogStatus = { state: "idle" | "loading" | "ready" | "error"; error: string };

export const CATALOG_IDLE: CatalogStatus = { state: "idle", error: "" };

type Catalog = Pick<AdminData, "courses" | "batches" | "sessions" | "sessionLinks" | "enrolments" | "moduleUnlocks" | "progress" | "certificates">;

const NO_CATALOG: Catalog = { courses: [], batches: [], sessions: [], sessionLinks: [], enrolments: [], moduleUnlocks: [], progress: [], certificates: [] };

let local: LocalData | null = null;
let catalog: Catalog = NO_CATALOG;
let status: CatalogStatus = CATALOG_IDLE;

/** The combined snapshot, rebuilt only after a change — useSyncExternalStore
 *  compares snapshots by identity. */
let cache: AdminData | null = null;

const emit = () => {
  cache = null;
  listeners.forEach((l) => l());
};

export function read(): AdminData {
  if (typeof window === "undefined") return EMPTY;
  cache ??= { ...readLocal(), ...catalog };
  return cache;
}

export const readCatalogStatus = () => status;

/* ------------------------------ local half ----------------------------- */

/** What localStorage may hold: this browser's records, plus leftovers from
 *  before courses, sessions and enrolments moved to the database. */
type Stored = Partial<LocalData> & {
  enrolments?: LegacyEnrolment[];
  courses?: unknown[];
  sessions?: unknown[];
  legacySessions?: unknown[];
  /** How many rounds of STARTERS this browser has already been given. */
  starters?: number;
};

/**
 * Real records every browser should have, added once.
 *
 * Parichita Kotnala leads every course on the website, and facilitators live
 * in this browser rather than the database, so without this each laptop would
 * need her typed in by hand. Her title, bio and photograph are the ones
 * levitatepeoplesoft.com publishes on her own page.
 *
 * Added once, not on every read: `starters` records that it happened, so
 * deleting her here stays deleted. Bump the number to add a later round.
 */
const STARTERS = 1;
const STARTER_FACILITATORS: Facilitator[] = [
  {
    id: "f_parichita_kotnala",
    name: "Parichita Kotnala",
    title: "Founder & Managing Partner, Levitate PeopleSoft",
    description:
      "Parichita brings over 15 years of global HR, leadership development and workplace culture experience across diverse teams and business environments. " +
      "Her work spans HR business partnering, leadership enablement, performance, employee relations, workplace compliance, PoSH, POCSO, wellbeing, DEIB and people advisory. " +
      "At Levitate PeopleSoft she leads the organisation's next phase of growth through globally designed, practice-led certification programs.",
    imageUrl: "https://levitatepeoplesoft.com/assets/parichita-kotnala.jpg",
    createdAt: "2026-09-14T00:00:00.000Z",
  },
];

/** Adds starters a browser has not been given yet. Someone already entered by
 *  hand under the same name is not added twice. */
function withStarters(data: LocalData, given: number): LocalData {
  if (given >= STARTERS) return data;
  const names = new Set(data.facilitators.map((f) => f.name.trim().toLowerCase()));
  const missing = STARTER_FACILITATORS.filter((f) => !names.has(f.name.toLowerCase()));
  return missing.length ? { ...data, facilitators: [...missing, ...data.facilitators] } : data;
}

/**
 * The ids of the records earlier versions seeded into every browser — five
 * invented enrolments and two facilitators. Dropped on read wherever they are
 * still stored. Generated ids carry a timestamp and random tail, so nothing
 * real can collide.
 */
const DEMO_IDS = new Set(["e_1", "e_2", "e_3", "e_4", "e_5", "f_parichita", "f_faculty"]);

/**
 * Enrolments this browser made before they moved to the database. Nothing
 * reads them any more except the prompt on the Enrolments screen, which offers
 * them as a CSV to re-enter before clearing them.
 */
let legacyEnrolments: LegacyEnrolment[] = [];

function readLocal(): LocalData {
  if (local) return local;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Stored;
      local = withStarters(
        {
          // Settings gained fields over time; anything absent takes the default.
          certificate: { ...DEFAULT_CERTIFICATE, ...(stored.certificate ?? {}) },
          facilitators: (stored.facilitators ?? []).filter((f) => !DEMO_IDS.has(f.id)),
        },
        stored.starters ?? 0,
      );
      legacyEnrolments = (stored.enrolments ?? []).filter((e) => !DEMO_IDS.has(e.id));
      // Rewrite once, so leftovers — an old copy of the catalogue, a demo
      // record — are gone rather than skipped on every read.
      const demo =
        (stored.facilitators ?? []).some((f) => DEMO_IDS.has(f.id)) ||
        (stored.enrolments ?? []).some((e) => DEMO_IDS.has(e.id));
      const stale = Boolean(stored.courses || stored.sessions || stored.legacySessions) || demo || (stored.starters ?? 0) < STARTERS;
      if (stale) persist();
    } else {
      local = withStarters(BLANK(), 0);
      persist();
    }
  } catch {
    local = withStarters(BLANK(), 0);
  }
  return local;
}

function persist() {
  if (!local) return;
  try {
    // `starters` is always the current round: whatever this browser holds now
    // already reflects it, including a starter someone has since deleted.
    const stored: Stored = {
      ...local,
      starters: STARTERS,
      ...(legacyEnrolments.length ? { enrolments: legacyEnrolments } : {}),
    };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* quota or private mode — changes will not survive a reload */
  }
}

function writeLocal(next: LocalData) {
  local = next;
  persist();
  emit();
}

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Browser-only enrolments from before the move, for the Enrolments screen. */
export function readLegacyEnrolments(): LegacyEnrolment[] {
  readLocal();
  return legacyEnrolments;
}

export function clearLegacyEnrolments() {
  readLocal();
  legacyEnrolments = [];
  persist();
  emit();
}

/* ---------------------------- database half ---------------------------- */

/** The website's order: display order, then title. */
const byCourseOrder = (a: Course, b: Course) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);

/** Soonest first, an undated session last. ISO days compare as strings. */
const bySessionDate = (a: Session, b: Session) =>
  (a.startsOn ?? "9999").localeCompare(b.startsOn ?? "9999") ||
  (Date.parse(a.startsAt ?? "") || 0) - (Date.parse(b.startsAt ?? "") || 0) ||
  a.createdAt.localeCompare(b.createdAt);

/** Soonest first; an undated batch after the dated ones. */
const byBatchDate = (a: Batch, b: Batch) =>
  (a.startsOn ?? "9999").localeCompare(b.startsOn ?? "9999") || a.createdAt.localeCompare(b.createdAt);

const byNewest = (a: Enrolment, b: Enrolment) => b.createdAt.localeCompare(a.createdAt);

function setCatalog(next: Partial<Catalog>) {
  const merged = { ...catalog, ...next };
  catalog = {
    courses: [...merged.courses].sort(byCourseOrder),
    batches: [...merged.batches].sort(byBatchDate),
    sessions: [...merged.sessions].sort(bySessionDate),
    sessionLinks: merged.sessionLinks,
    enrolments: [...merged.enrolments].sort(byNewest),
    moduleUnlocks: merged.moduleUnlocks,
    progress: merged.progress,
    certificates: merged.certificates,
  };
  emit();
}

function setStatus(next: CatalogStatus) {
  status = next;
  emit();
}

/** Bumped by every load and by sign-out, so an answer arriving late for a
 *  session that has since changed hands is dropped rather than shown. */
let generation = 0;

/** Reads the whole database half. Staff read every row, drafts included. */
export async function loadCatalog(): Promise<void> {
  const mine = ++generation;
  setStatus({ state: "loading", error: "" });
  try {
    const db = await getClient();
    const [courses, batches, sessions, links, enrolments] = await Promise.all([
      db.from("courses").select("*").order("sort_order").order("title"),
      db.from("batches").select("*"),
      db.from("sessions").select("*"),
      db.from("session_links").select("*"),
      db.from("enrolments").select("*").order("created_at", { ascending: false }),
    ]);
    const error = courses.error ?? batches.error ?? sessions.error ?? links.error ?? enrolments.error;
    if (error) throw error;

    // Unlocks and progress enrich the batch screen but are not needed to run
    // the rest, so a database that has not had 0017 yet still loads.
    const [unlocks, progress, certificates] = await Promise.all([
      db.from("batch_module_unlocks").select("*"),
      db.from("course_progress_admin").select("user_id, course_slug, completed_items, completed_at, updated_at"),
      db.from("certificates").select("*").order("issued_at", { ascending: false }),
    ]);
    if (mine !== generation) return;
    setCatalog({
      courses: ((courses.data ?? []) as CourseRow[]).map(courseFromRow),
      batches: ((batches.data ?? []) as BatchDbRow[]).map(batchFromRow),
      sessions: ((sessions.data ?? []) as SessionRow[]).map(sessionFromRow),
      sessionLinks: ((links.data ?? []) as SessionLinkRow[]).map(sessionLinkFromRow),
      enrolments: ((enrolments.data ?? []) as EnrolmentRow[]).map(enrolmentFromRow),
      moduleUnlocks: unlocks.error ? [] : ((unlocks.data ?? []) as ModuleUnlockRow[]).map((r) => ({
        batchId: r.batch_id,
        moduleId: r.module_id,
        unlockedAt: r.unlocked_at,
        afterSessionId: r.after_session_id ?? null,
      })),
      progress: progress.error ? [] : ((progress.data ?? []) as {
        user_id: string; course_slug: string; completed_items: string[] | null;
        completed_at: string | null; updated_at: string;
      }[]).map((r) => ({
        userId: r.user_id,
        courseSlug: r.course_slug,
        completedItems: r.completed_items ?? [],
        completedAt: r.completed_at ?? null,
        updatedAt: r.updated_at,
      })),
      // Like unlocks and progress: a database without 0020 still loads, it
      // just has no register to show yet.
      certificates: certificates.error ? [] : ((certificates.data ?? []) as CertificateRow[]).map(certificateFromRow),
    });
    setStatus({ state: "ready", error: "" });
  } catch (e) {
    if (mine !== generation) return;
    const err = e as Partial<DbError>;
    setStatus({ state: "error", error: friendly({ message: err.message ?? String(e), code: err.code }) });
  }
}

/** On sign-out: the next account may not be allowed to see the same rows. */
export function clearCatalog() {
  generation++;
  catalog = NO_CATALOG;
  status = CATALOG_IDLE;
  emit();
}

type DbError = { message: string; code?: string };
export type Failure = { ok: false; error: string };
export type SaveResult = { ok: true } | Failure;

const NOT_SAVED =
  "Nothing was saved. It may have been deleted by someone else, or this account cannot change it — reload the page and check.";
const NOT_DELETED =
  "Nothing was deleted. It may already be gone, or this account cannot delete it — reload the page and check.";
/** A delete refused because a row elsewhere still points at this one. */
const IN_USE = "Something in the database still points at it.";

/** Turns a database refusal into a sentence someone can act on. */
function friendly({ message, code }: DbError): string {
  if (code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "Only an admin can make changes here. This account can view, not edit.";
  }
  if (/Batch is full/i.test(message)) return "That batch is full. Add seats to the batch, or choose another one.";
  if (/enrolments_one_per_batch/.test(message)) return "Someone with that email is already enrolled in this batch.";
  if (/batches_course_code/.test(message)) return "Another batch of this course already uses that code.";
  if (/_https|join_url|recording_url|payment_link/.test(message)) return "Links have to be full addresses starting with https://";
  if (/has no module/.test(message)) return message;
  if (/batches_ends_after_starts|sessions_ends_after_starts/.test(message)) return "The end has to be after the start.";
  if (code === "23503") return IN_USE;
  if (code === "23505") return "That already exists. Reload the page and check.";
  if (/admin_assign_learner|admin_unassign_learner|admin_reset_progress/.test(message)) {
    return "This needs migration 0018 — run it in the Supabase SQL editor, then reload.";
  }
  if (/does not exist|schema cache/i.test(message)) {
    return "The database is missing tables or columns this screen needs. Run migrations 0013, 0014 and 0015 in the Supabase SQL editor, then reload.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Could not reach the database. Check the connection and try again.";
  }
  return message;
}

/**
 * Runs one write and turns every way it can fail — a thrown network error, a
 * refusal, or a policy that quietly matched no row — into a `Failure`.
 *
 * Every write asks for the row back for that last reason: row-level security
 * does not reject an update or delete it filters out, it just changes nothing,
 * and without the row there would be no way to tell.
 */
async function run<T>(
  write: (db: SupabaseClient) => PromiseLike<{ data: T | null; error: DbError | null }>,
  none = NOT_SAVED,
): Promise<{ ok: true; data: T } | Failure> {
  try {
    const { data, error } = await write(await getClient());
    if (error) return { ok: false, error: friendly(error) };
    if (data === null || (Array.isArray(data) && data.length === 0)) return { ok: false, error: none };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: friendly({ message: e instanceof Error ? e.message : String(e) }) };
  }
}

/**
 * Ids are made here rather than by the database, so a new row is on screen —
 * already carrying its final id — before the insert returns.
 */
function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID exists only on https and localhost; getRandomValues everywhere.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Replaces the row with the same id in one list of the catalogue. */
function put<K extends "courses" | "batches" | "sessions" | "enrolments">(list: K, row: Catalog[K][number]) {
  setCatalog({ [list]: (catalog[list] as { id: string }[]).map((r) => (r.id === row.id ? row : r)) } as Partial<Catalog>);
}

/* --------------------------- certificates ---------------------------- */

export function updateCertificateSettings(patch: Partial<CertificateSettings>) {
  const d = readLocal();
  writeLocal({ ...d, certificate: { ...d.certificate, ...patch } });
}

/* --------------------------- facilitators ---------------------------- */

export function createFacilitator(input: Omit<Facilitator, "id" | "createdAt">): Facilitator {
  const facilitator: Facilitator = { ...input, id: id("f"), createdAt: new Date().toISOString() };
  const d = readLocal();
  writeLocal({ ...d, facilitators: [...d.facilitators, facilitator] });
  return facilitator;
}

export function updateFacilitator(facilitatorId: string, patch: Partial<Omit<Facilitator, "id" | "createdAt">>) {
  const d = readLocal();
  writeLocal({
    ...d,
    facilitators: d.facilitators.map((f) => (f.id === facilitatorId ? { ...f, ...patch } : f)),
  });
}

/**
 * Refuses while any course still points at them.
 *
 * Silently clearing the reference would leave courses with no facilitator and
 * nobody any the wiser, so the caller is told which courses to reassign first.
 */
export function removeFacilitator(facilitatorId: string): { blocked: string[] } {
  const used = catalog.courses.filter((c) => c.facilitatorId === facilitatorId).map((c) => c.title);
  if (used.length) return { blocked: used };
  const d = readLocal();
  writeLocal({ ...d, facilitators: d.facilitators.filter((f) => f.id !== facilitatorId) });
  return { blocked: [] };
}

/** Courses this person leads. */
export const coursesFor = (d: AdminData, facilitatorId: string) =>
  d.courses.filter((c) => c.facilitatorId === facilitatorId);

/* ------------------------------ courses ------------------------------ */

/*
 * There is no createCourse. A course carries the website's own copy — its
 * slug, its card text, its imagery — and a slug is permanent once anyone has
 * shared a link to it. Adding one is a migration, reviewed like the rest of
 * the catalogue; the admin edits what changes between batches.
 */

export async function updateCourse(courseId: string, patch: Partial<CourseInput>): Promise<SaveResult> {
  const before = catalog.courses.find((c) => c.id === courseId);
  if (!before) return { ok: false, error: "That course is no longer in the catalogue. Reload the page." };
  const after: Course = { ...before, ...patch };
  put("courses", after);

  const res = await run<CourseRow>((db) =>
    db.from("courses").update(coursePatchToRow(after, patch)).eq("id", courseId).select().maybeSingle(),
  );
  if (!res.ok) {
    // Undo only this edit. If something newer has replaced the row since,
    // that is more current than either copy held here.
    if (catalog.courses.find((c) => c.id === courseId) === after) put("courses", before);
    return res;
  }
  put("courses", courseFromRow(res.data));
  return { ok: true };
}

/**
 * Deleting a course would erase its batches and the record of who took them,
 * so a course with any batch is archived instead — the database refuses the
 * delete (batches restrict it), and the refusal becomes an archive.
 */
export async function removeCourse(courseId: string): Promise<{ ok: true; archived: boolean } | Failure> {
  const archive = async () => {
    const res = await updateCourse(courseId, { status: "archived" });
    return res.ok ? { ok: true as const, archived: true } : res;
  };
  if (catalog.batches.some((b) => b.courseId === courseId)) return archive();

  const before = catalog;
  setCatalog({
    courses: catalog.courses.filter((c) => c.id !== courseId),
    sessions: catalog.sessions.filter((s) => s.courseId !== courseId),
  });

  const res = await run<{ id: string }[]>((db) => db.from("courses").delete().eq("id", courseId).select("id"), NOT_DELETED);
  if (res.ok) return { ok: true, archived: false };

  setCatalog({ courses: before.courses, sessions: before.sessions });
  return res.error === IN_USE ? archive() : res;
}

/* ------------------------------ batches ------------------------------ */

/** Whole days from one ISO day to another. */
function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/** An ISO day moved by a number of days. */
function shiftDay(iso: string, days: number): string {
  const t = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + days));
  return t.toISOString().slice(0, 10);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-03" → "Sat 3 Oct 2026", the label the website prints. */
export function sessionDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Creates a batch, optionally with the sessions of an earlier batch copied
 * into it — same timings, topics and facilitators, every date moved so the
 * first session lands on `firstDay`. Zoom links are not copied: each run has
 * its own meetings.
 */
export async function createBatch(
  input: BatchInput,
  copy?: { fromBatchId: string; firstDay: string },
): Promise<{ ok: true; batch: Batch } | Failure> {
  const batch: Batch = { ...input, id: uuid(), completedAt: null, createdAt: new Date().toISOString() };
  setCatalog({ batches: [...catalog.batches, batch] });

  const res = await run<BatchDbRow>((db) => db.from("batches").insert({ id: batch.id, ...batchToRow(batch) }).select().single());
  if (!res.ok) {
    setCatalog({ batches: catalog.batches.filter((b) => b.id !== batch.id) });
    return res;
  }
  const saved = batchFromRow(res.data);
  put("batches", saved);

  if (copy) {
    const source = catalog.sessions.filter((s) => s.batchId === copy.fromBatchId && s.startsOn);
    const anchor = source[0]?.startsOn;
    if (anchor) {
      const shift = daysBetween(anchor, copy.firstDay);
      const moveInstant = (iso: string | null) => (iso ? new Date(Date.parse(iso) + shift * 86_400_000).toISOString() : null);
      const sessions: Session[] = source.map((s) => {
        const day = shiftDay(s.startsOn!, shift);
        return {
          ...s,
          id: uuid(),
          batchId: saved.id,
          startsOn: day,
          date: sessionDateLabel(day),
          startsAt: moveInstant(s.startsAt),
          endsAt: moveInstant(s.endsAt),
          seats: saved.seats,
          status: "open",
          createdAt: new Date().toISOString(),
        };
      });
      setCatalog({ sessions: [...catalog.sessions, ...sessions] });
      const copied = await run<SessionRow[]>((db) =>
        db.from("sessions").insert(sessions.map((s) => ({ id: s.id, ...sessionToRow(s) }))).select(),
      );
      if (!copied.ok) {
        const ids = new Set(sessions.map((s) => s.id));
        setCatalog({ sessions: catalog.sessions.filter((s) => !ids.has(s.id)) });
        return { ok: false, error: `The batch was created, but its sessions could not be copied: ${copied.error}` };
      }
      const rows = copied.data.map(sessionFromRow);
      const byId = new Map(rows.map((r) => [r.id, r]));
      setCatalog({ sessions: catalog.sessions.map((s) => byId.get(s.id) ?? s) });
    }
  }
  return { ok: true, batch: saved };
}

export async function updateBatch(batchId: string, patch: Partial<BatchInput>): Promise<SaveResult> {
  const before = catalog.batches.find((b) => b.id === batchId);
  if (!before) return { ok: false, error: "That batch no longer exists. Reload the page." };
  const after: Batch = { ...before, ...patch };
  put("batches", after);

  const res = await run<BatchDbRow>((db) => db.from("batches").update(batchToRow(after)).eq("id", batchId).select().maybeSingle());
  if (!res.ok) {
    if (catalog.batches.find((b) => b.id === batchId) === after) put("batches", before);
    return res;
  }
  put("batches", batchFromRow(res.data));

  // Completing or cancelling closes the batch's sessions in the database.
  // Read them back so this screen shows what the website now shows.
  if (patch.status && patch.status !== before.status) {
    try {
      const db = await getClient();
      const { data } = await db.from("sessions").select("*").eq("batch_id", batchId);
      if (data) {
        const fresh = new Map((data as SessionRow[]).map((r) => [r.id, sessionFromRow(r)]));
        setCatalog({ sessions: catalog.sessions.map((s) => fresh.get(s.id) ?? s) });
      }
    } catch {
      /* the next load will show them */
    }
  }
  return { ok: true };
}

/** Refuses while anyone is enrolled — their history belongs to the batch. */
export async function removeBatch(batchId: string): Promise<{ ok: true; blocked: boolean } | Failure> {
  if (catalog.enrolments.some((e) => e.batchId === batchId)) return { ok: true, blocked: true };
  const before = catalog;
  setCatalog({
    batches: catalog.batches.filter((b) => b.id !== batchId),
    sessions: catalog.sessions.filter((s) => s.batchId !== batchId),
  });

  const res = await run<{ id: string }[]>((db) => db.from("batches").delete().eq("id", batchId).select("id"), NOT_DELETED);
  if (res.ok) return { ok: true, blocked: false };

  setCatalog({ batches: before.batches, sessions: before.sessions });
  return res.error === IN_USE ? { ok: true, blocked: true } : res;
}

/* ------------------------------ sessions ----------------------------- */

export async function createSession(input: SessionInput, link?: Omit<SessionLink, "sessionId">): Promise<SaveResult> {
  const session: Session = { ...input, id: uuid(), createdAt: new Date().toISOString() };
  setCatalog({ sessions: [...catalog.sessions, session] });

  const res = await run<SessionRow>((db) =>
    db.from("sessions").insert({ id: session.id, ...sessionToRow(session) }).select().single(),
  );
  if (!res.ok) {
    setCatalog({ sessions: catalog.sessions.filter((s) => s.id !== session.id) });
    return res;
  }
  put("sessions", sessionFromRow(res.data));
  return link ? saveSessionLink({ ...link, sessionId: session.id }) : { ok: true };
}

export async function updateSession(
  sessionId: string,
  patch: Partial<SessionInput>,
  link?: Omit<SessionLink, "sessionId">,
): Promise<SaveResult> {
  const before = catalog.sessions.find((s) => s.id === sessionId);
  if (!before) return { ok: false, error: "That session is no longer scheduled. Reload the page." };
  const after: Session = { ...before, ...patch };
  put("sessions", after);

  const res = await run<SessionRow>((db) =>
    db.from("sessions").update(sessionToRow(after)).eq("id", sessionId).select().maybeSingle(),
  );
  if (!res.ok) {
    if (catalog.sessions.find((s) => s.id === sessionId) === after) put("sessions", before);
    return res;
  }
  put("sessions", sessionFromRow(res.data));
  return link ? saveSessionLink({ ...link, sessionId }) : { ok: true };
}

/** Saves a session's Zoom details, or removes the row when every field is
 *  blank — an empty row would read as "link set" to anything counting them. */
export async function saveSessionLink(link: SessionLink): Promise<SaveResult> {
  const clean: SessionLink = {
    sessionId: link.sessionId,
    joinUrl: link.joinUrl.trim(),
    meetingId: link.meetingId.trim(),
    passcode: link.passcode.trim(),
    recordingUrl: link.recordingUrl.trim(),
  };
  const empty = !clean.joinUrl && !clean.meetingId && !clean.passcode && !clean.recordingUrl;
  const before = catalog.sessionLinks;
  setCatalog({
    sessionLinks: [...before.filter((l) => l.sessionId !== clean.sessionId), ...(empty ? [] : [clean])],
  });

  const had = before.some((l) => l.sessionId === clean.sessionId);
  if (empty && !had) return { ok: true };

  const res = empty
    ? await run<{ session_id: string }[]>((db) =>
        db.from("session_links").delete().eq("session_id", clean.sessionId).select("session_id"), NOT_DELETED)
    : await run<SessionLinkRow>((db) =>
        db.from("session_links").upsert(sessionLinkToRow(clean), { onConflict: "session_id" }).select().single());
  if (!res.ok) {
    setCatalog({ sessionLinks: before });
    return { ok: false, error: `The session was saved, but its Zoom details were not: ${res.error}` };
  }
  return { ok: true };
}

export async function removeSession(sessionId: string): Promise<SaveResult> {
  const before = catalog;
  if (!before.sessions.some((s) => s.id === sessionId)) return { ok: true };
  setCatalog({
    sessions: before.sessions.filter((s) => s.id !== sessionId),
    sessionLinks: before.sessionLinks.filter((l) => l.sessionId !== sessionId),
  });

  const res = await run<{ id: string }[]>((db) => db.from("sessions").delete().eq("id", sessionId).select("id"), NOT_DELETED);
  if (res.ok) return { ok: true };

  setCatalog({ sessions: before.sessions, sessionLinks: before.sessionLinks });
  return res;
}

/* ----------------------------- enrolments ---------------------------- */

export async function createEnrolment(input: EnrolmentInput): Promise<{ ok: true; enrolment: Enrolment } | Failure> {
  const enrolment: Enrolment = {
    ...input,
    id: uuid(),
    userId: null,
    claimCode: "",
    paidAt: input.status === "paid" ? new Date().toISOString() : null,
    cancelledAt: null,
    linkedAt: null,
    completedAt: null,
    certificateSentAt: null,
    toolkitSentAt: null,
    createdAt: new Date().toISOString(),
  };
  setCatalog({ enrolments: [enrolment, ...catalog.enrolments] });

  const res = await run<EnrolmentRow>((db) =>
    db.from("enrolments").insert({ id: enrolment.id, ...enrolmentToRow(enrolment) }).select().single(),
  );
  if (!res.ok) {
    setCatalog({ enrolments: catalog.enrolments.filter((e) => e.id !== enrolment.id) });
    return res;
  }
  const saved = enrolmentFromRow(res.data);
  put("enrolments", saved);
  return { ok: true, enrolment: saved };
}

export async function updateEnrolment(enrolmentId: string, patch: Partial<EnrolmentInput>): Promise<SaveResult> {
  const before = catalog.enrolments.find((e) => e.id === enrolmentId);
  if (!before) return { ok: false, error: "That enrolment no longer exists. Reload the page." };
  const after: Enrolment = { ...before, ...patch };
  put("enrolments", after);

  const res = await run<EnrolmentRow>((db) =>
    db.from("enrolments").update(enrolmentToRow(after)).eq("id", enrolmentId).select().maybeSingle(),
  );
  if (!res.ok) {
    if (catalog.enrolments.find((e) => e.id === enrolmentId) === after) put("enrolments", before);
    return res;
  }
  put("enrolments", enrolmentFromRow(res.data));
  return { ok: true };
}

/** Paid, back to pending, or cancelled. The database stamps when and by whom. */
export const setEnrolmentStatus = (enrolmentId: string, next: EnrolmentStatus) =>
  updateEnrolment(enrolmentId, { status: next });

/* ----------------------- assigning accounts by hand ------------------ */

/** Someone who signed up on the website: the pool a batch is assigned from. */
export type LearnerAccount = { id: string; name: string; email: string; org: string; joinedAt: string };

/**
 * Every account on the LMS, newest first.
 *
 * Read straight from `profiles`, which only an admin may read in full — a
 * viewer gets their own row back and so sees nobody to assign, which is the
 * right answer for an account that cannot assign anyone anyway.
 */
export async function listLearnerAccounts(): Promise<LearnerAccount[]> {
  const res = await run<{ id: string; name: string | null; email: string | null; org: string | null; created_at: string }[]>((db) =>
    db.from("profiles")
      .select("id, name, email, org, created_at")
      // Learners only: people who signed up on the website. Portal accounts —
      // admins and viewers — belong to Users, and the LMS refuses them a
      // learner session anyway, so listing them here would only offer seats
      // that could never be used.
      .eq("role", "learner")
      .order("created_at", { ascending: false }),
    "No accounts found.",
  );
  if (!res.ok) return [];
  return res.data.map((r) => ({
    id: r.id,
    email: r.email ?? "",
    name: (r.name ?? "").trim() || (r.email ?? "").split("@")[0],
    org: (r.org ?? "").trim(),
    joinedAt: r.created_at,
  }));
}

/**
 * Gives an existing account paid access to a batch without a payment.
 *
 * For testing the learner side, and for a comped seat. The row it writes is
 * marked `Admin`/`offline` so no report mistakes it for money received, and
 * the database refuses this to anyone but an admin.
 */
export async function assignLearner(userId: string, batchId: string): Promise<{ ok: true; enrolment: Enrolment } | Failure> {
  const res = await run<EnrolmentRow>((db) =>
    db.rpc("admin_assign_learner", { p_user_id: userId, p_batch_id: batchId }).single(),
  );
  if (!res.ok) return res;

  const saved = enrolmentFromRow(res.data);
  // Re-assigning someone brings their old row back rather than adding one.
  setCatalog({
    enrolments: catalog.enrolments.some((e) => e.id === saved.id)
      ? catalog.enrolments.map((e) => (e.id === saved.id ? saved : e))
      : [saved, ...catalog.enrolments],
  });
  return { ok: true, enrolment: saved };
}

/**
 * Takes an assigned seat away again.
 *
 * An enrolment that carries a Razorpay payment is cancelled instead of
 * deleted — the seat frees either way, but the record of a real sale is not
 * ours to erase. The database decides which happened and says so.
 */
export async function unassignLearner(enrolmentId: string): Promise<{ ok: true; outcome: "deleted" | "cancelled" } | Failure> {
  const res = await run<"deleted" | "cancelled">((db) =>
    db.rpc("admin_unassign_learner", { p_enrolment_id: enrolmentId }),
  );
  if (!res.ok) return res;

  setCatalog(
    res.data === "deleted"
      ? { enrolments: catalog.enrolments.filter((e) => e.id !== enrolmentId) }
      : {
          enrolments: catalog.enrolments.map((e) =>
            e.id === enrolmentId ? { ...e, status: "cancelled" as EnrolmentStatus, cancelledAt: new Date().toISOString() } : e,
          ),
        },
  );
  return { ok: true, outcome: res.data };
}

/* ------------------------------ certificates ------------------------- */

/** The certificate issued against a seat, if there is one. */
export const certificateFor = (d: AdminData, enrolmentId: string) =>
  d.certificates.find((c) => c.enrolmentId === enrolmentId) ?? null;

/**
 * Issues a certificate for a seat, on the office's judgement.
 *
 * Unlike the learner's own route, completion is not checked here: an admin
 * issuing for someone is the decision, and the database records who made it.
 * Asking twice returns the certificate that already exists rather than
 * minting a second number.
 */
export async function issueCertificate(
  enrolmentId: string,
  name?: string,
  completedOn?: string,
): Promise<{ ok: true; certificate: Certificate } | Failure> {
  const res = await run<CertificateRow>((db) =>
    db.rpc("admin_issue_certificate", {
      p_enrolment_id: enrolmentId,
      p_name: name?.trim() || null,
      p_completed_on: completedOn || null,
    }).single(),
  );
  if (!res.ok) return res;

  const cert = certificateFromRow(res.data);
  setCatalog({
    certificates: catalog.certificates.some((c) => c.id === cert.id)
      ? catalog.certificates.map((c) => (c.id === cert.id ? cert : c))
      : [cert, ...catalog.certificates],
  });
  return { ok: true, certificate: cert };
}

/**
 * Withdraws a certificate without erasing it.
 *
 * The number stays in the register, so checking it answers "revoked" rather
 * than "never existed" — which is the whole point of a number that claims to
 * be verifiable.
 */
export async function revokeCertificate(certificateId: string, reason?: string): Promise<SaveResult> {
  const res = await run<CertificateRow>((db) =>
    db.rpc("admin_revoke_certificate", { p_cert_id: certificateId, p_reason: reason?.trim() ?? "" }).single(),
  );
  if (!res.ok) return res;

  const cert = certificateFromRow(res.data);
  setCatalog({ certificates: catalog.certificates.map((c) => (c.id === cert.id ? cert : c)) });
  return { ok: true };
}

/**
 * Wipes what an account has read on one course, so it can be walked again.
 *
 * Progress lives on the account rather than the seat, so this is separate
 * from assigning and unassigning: removing someone keeps their progress on
 * purpose, and only this throws it away. Returns how many lessons were
 * cleared.
 */
export async function resetProgress(userId: string, courseSlug: string): Promise<{ ok: true; cleared: number } | Failure> {
  const res = await run<number>((db) =>
    db.rpc("admin_reset_progress", { p_user_id: userId, p_course_slug: courseSlug }),
  );
  if (!res.ok) return res;

  setCatalog({ progress: catalog.progress.filter((p) => !(p.userId === userId && p.courseSlug === courseSlug)) });
  return { ok: true, cleared: res.data ?? 0 };
}

/* --------------------------- module unlocks -------------------------- */

/** Opens modules for everyone in a batch, typically after a live session. */
export async function unlockModules(batchId: string, moduleIds: string[], afterSessionId: string | null): Promise<SaveResult> {
  const fresh = moduleIds.filter((m) => !catalog.moduleUnlocks.some((u) => u.batchId === batchId && u.moduleId === m));
  if (!fresh.length) return { ok: true };
  const now = new Date().toISOString();
  const added: ModuleUnlock[] = fresh.map((moduleId) => ({ batchId, moduleId, unlockedAt: now, afterSessionId }));
  const before = catalog.moduleUnlocks;
  setCatalog({ moduleUnlocks: [...before, ...added] });

  const res = await run<ModuleUnlockRow[]>((db) =>
    db.from("batch_module_unlocks")
      .insert(added.map((u) => ({ batch_id: u.batchId, module_id: u.moduleId, after_session_id: u.afterSessionId })))
      .select(),
  );
  if (!res.ok) {
    setCatalog({ moduleUnlocks: before });
    return res;
  }
  return { ok: true };
}

/** Closes a module again for the batch — for one opened by mistake. */
export async function relockModule(batchId: string, moduleId: string): Promise<SaveResult> {
  const before = catalog.moduleUnlocks;
  setCatalog({ moduleUnlocks: before.filter((u) => !(u.batchId === batchId && u.moduleId === moduleId)) });
  const res = await run<{ module_id: string }[]>((db) =>
    db.from("batch_module_unlocks").delete().eq("batch_id", batchId).eq("module_id", moduleId).select("module_id"),
    NOT_DELETED,
  );
  if (!res.ok) {
    setCatalog({ moduleUnlocks: before });
    return res;
  }
  return { ok: true };
}

/** Whether a module is open for a batch: released on enrolment, or unlocked. */
export const isModuleOpen = (d: AdminData, batchId: string, module: { id: string; release?: string }) =>
  module.release === "enrolment" || d.moduleUnlocks.some((u) => u.batchId === batchId && u.moduleId === module.id);

/** A learner's progress on a course, if they have an account and have started. */
export function progressFor(d: AdminData, enrolment: Enrolment): LearnerProgress | null {
  if (!enrolment.userId) return null;
  const slug = d.courses.find((c) => c.id === enrolment.courseId)?.slug;
  return d.progress.find((p) => p.userId === enrolment.userId && p.courseSlug === slug) ?? null;
}

/* ------------------------------ derived ------------------------------ */

/** Everyone holding a seat on a batch: paid, or still to pay. */
export const activeEnrolments = (d: AdminData, batchId: string) =>
  d.enrolments.filter((e) => e.batchId === batchId && e.status !== "cancelled");

export const batchTaken = (d: AdminData, batchId: string) =>
  activeEnrolments(d, batchId).reduce((a, e) => a + e.seats, 0);

export const batchSeatsLeft = (d: AdminData, batch: Batch) => Math.max(0, batch.seats - batchTaken(d, batch.id));

export const sessionsOf = (d: AdminData, batchId: string) => d.sessions.filter((s) => s.batchId === batchId);

export const linkFor = (d: AdminData, sessionId: string) => d.sessionLinks.find((l) => l.sessionId === sessionId) ?? null;

/** First and last dated session, falling back to the batch's own dates. */
export function batchWindow(d: AdminData, batch: Batch): { from: string | null; to: string | null } {
  const days = sessionsOf(d, batch.id).map((s) => s.startsOn).filter((x): x is string => Boolean(x)).sort();
  return { from: days[0] ?? batch.startsOn, to: days[days.length - 1] ?? batch.endsOn };
}

/** Batches that can take someone: not finished, open for enrolment. */
export const enrollableBatches = (d: AdminData) =>
  d.batches.filter((b) => (b.status === "upcoming" || b.status === "running") && b.enrolmentOpen);


/**
 * Empties this browser's own records — facilitators and the certificate
 * settings. Everything in the database is left alone.
 */
export function resetAll() {
  writeLocal(BLANK());
}
