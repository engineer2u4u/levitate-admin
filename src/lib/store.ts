import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminData,
  CertificateSettings,
  Course,
  CourseInput,
  Enrolment,
  Facilitator,
  LocalData,
  Session,
  SessionInput,
} from "./types";
import { DEFAULT_CERTIFICATE } from "./certificate";
import {
  courseFromRow,
  coursePatchToRow,
  getClient,
  sessionFromRow,
  sessionToRow,
  type CourseRow,
  type SessionRow,
} from "./supabase";

/**
 * Persistence for the admin, in two halves.
 *
 * Courses and sessions live in Supabase — the same `courses` and `sessions`
 * tables the public website reads, so what is saved here is what visitors
 * see. They load once a staff session exists (AuthGate asks for them), and
 * every change is shown first and written second: a write the database
 * refuses is rolled back and its reason handed to the caller to show.
 *
 * Facilitators, enrolments and certificate settings are still localStorage —
 * per-browser, and shared with nobody. Screens read both halves as one
 * `AdminData` snapshot and never need to know which is which.
 */
const KEY = "lvt.admin.data.v1";

const listeners = new Set<() => void>();

export const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb) as unknown as void;
};

export const EMPTY: AdminData = { certificate: DEFAULT_CERTIFICATE, facilitators: [], courses: [], sessions: [], enrolments: [] };

/**
 * What a browser starts with: the certificate defaults and nothing else.
 *
 * It used to start with invented facilitators and enrolments, so the screens
 * would not look empty on a first run. They made the Courses screen quote
 * enrolment counts and fees collected that no customer had ever paid, which is
 * worse than an empty screen — the empty states say what to do next.
 */
const BLANK = (): LocalData => ({ certificate: DEFAULT_CERTIFICATE, facilitators: [], enrolments: [] });

/** Where the database half stands. `idle` means nobody has asked yet. */
export type CatalogStatus = { state: "idle" | "loading" | "ready" | "error"; error: string };

export const CATALOG_IDLE: CatalogStatus = { state: "idle", error: "" };

let local: LocalData | null = null;
let catalog: { courses: Course[]; sessions: Session[] } = { courses: [], sessions: [] };
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
  cache ??= { ...readLocal(), courses: catalog.courses, sessions: catalog.sessions };
  return cache;
}

export const readCatalogStatus = () => status;

/* ------------------------------ local half ----------------------------- */

/**
 * The demo catalogue's course ids, and the database course that replaced
 * each. Enrolments made before the move point at these, and are re-pointed
 * once the real courses load. Any other id is left exactly as it is.
 */
const LEGACY_COURSES: Record<string, string> = {
  c_posh: "posh-trainer",
  c_pocso: "pocso-child-safety",
  c_dei: "inclusive-workplace",
  c_well: "workplace-wellbeing",
};

/** What is kept of a session from the old local catalogue: enough to find
 *  the same day in the database, and nothing else. */
type LegacySession = { id: string; courseId: string; date: string };

/** Held until the database catalogue has loaded once, then dropped. */
let legacySessions: LegacySession[] | null = null;

/** What localStorage may hold: this browser's records and — from before the
 *  move to the database — its old copy of the catalogue. */
type Stored = Partial<LocalData> & {
  courses?: unknown[];
  sessions?: LegacySession[];
  legacySessions?: LegacySession[];
};

/**
 * The ids of the records earlier versions seeded into every browser — five
 * invented enrolments and two facilitators. Dropped on read wherever they are
 * still stored, so what these screens count is this business's own. Generated
 * ids carry a timestamp and random tail, so nothing real can collide.
 */
const DEMO_IDS = new Set(["e_1", "e_2", "e_3", "e_4", "e_5", "f_parichita", "f_faculty"]);

/** Fills in fields added after a browser last wrote its data, and takes out
 *  the demo records it may have been given on a first run. */
function normalise(data: Stored): LocalData {
  return {
    // Settings gained fields over time; anything absent takes the default.
    certificate: { ...DEFAULT_CERTIFICATE, ...(data.certificate ?? {}) },
    facilitators: (data.facilitators ?? []).filter((f) => !DEMO_IDS.has(f.id)),
    enrolments: (data.enrolments ?? []).filter((e) => !DEMO_IDS.has(e.id)),
  };
}

function readLocal(): LocalData {
  if (local) return local;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Stored;
      local = normalise(stored);
      const demo =
        local.facilitators.length !== (stored.facilitators?.length ?? 0) ||
        local.enrolments.length !== (stored.enrolments?.length ?? 0);
      // A browser from before the move still holds its own courses and
      // sessions. The courses are ignored — the database has them — but the
      // session dates are kept until enrolments booked on them are re-pointed.
      const hints = stored.legacySessions ?? (stored.sessions ?? []).map(({ id, courseId, date }) => ({ id, courseId, date }));
      legacySessions = hints.length ? hints : null;
      // Rewrite straight away, so the old copy of the catalogue — and any
      // demo record just dropped — is gone rather than dropped again on
      // every read.
      if (stored.courses || stored.sessions || demo) persist();
    } else {
      local = BLANK();
      persist();
    }
  } catch {
    local = BLANK();
  }
  return local;
}

function persist() {
  if (!local) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(legacySessions ? { ...local, legacySessions } : local));
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

/* ---------------------------- database half ---------------------------- */

/** The website's order: display order, then title. */
const byCourseOrder = (a: Course, b: Course) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);

/** Soonest first, an undated session last. ISO days compare as strings. */
const bySessionDate = (a: Session, b: Session) =>
  (a.startsOn ?? "9999").localeCompare(b.startsOn ?? "9999") ||
  (Date.parse(a.startsAt ?? "") || 0) - (Date.parse(b.startsAt ?? "") || 0) ||
  a.createdAt.localeCompare(b.createdAt);

function setCatalog(next: { courses: Course[]; sessions: Session[] }) {
  catalog = { courses: [...next.courses].sort(byCourseOrder), sessions: [...next.sessions].sort(bySessionDate) };
  emit();
}

function setStatus(next: CatalogStatus) {
  status = next;
  emit();
}

/** Bumped by every load and by sign-out, so an answer arriving late for a
 *  session that has since changed hands is dropped rather than shown. */
let generation = 0;

/** Reads every course and session. Staff read all rows, drafts included. */
export async function loadCatalog(): Promise<void> {
  const mine = ++generation;
  setStatus({ state: "loading", error: "" });
  try {
    const db = await getClient();
    const [courses, sessions] = await Promise.all([
      db.from("courses").select("*").order("sort_order").order("title"),
      db.from("sessions").select("*").order("starts_on", { ascending: true, nullsFirst: false }),
    ]);
    const error = courses.error ?? sessions.error;
    if (error) throw new Error(friendly(error));
    if (mine !== generation) return;
    setCatalog({
      courses: ((courses.data ?? []) as CourseRow[]).map(courseFromRow),
      sessions: ((sessions.data ?? []) as SessionRow[]).map(sessionFromRow),
    });
    repointLegacy();
    setStatus({ state: "ready", error: "" });
  } catch (e) {
    if (mine !== generation) return;
    setStatus({ state: "error", error: friendly({ message: e instanceof Error ? e.message : String(e) }) });
  }
}

/** On sign-out: the next account may not be allowed to see the same rows. */
export function clearCatalog() {
  generation++;
  catalog = { courses: [], sessions: [] };
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
    return "Only an admin can change courses and sessions. This account can view them, not edit them.";
  }
  if (code === "23503") return IN_USE;
  if (code === "23505") return "Another course already has that web address. Reload the page and save again.";
  if (/sessions_ends_after_starts/.test(message)) return "The end time has to be after the start time.";
  if (/does not exist|schema cache/i.test(message)) {
    return "The database is missing columns this screen needs. Run migrations 0007 and 0008 in the Supabase SQL editor, then reload.";
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

/** Puts a course in place of the one with its id. */
const putCourse = (course: Course) =>
  setCatalog({ ...catalog, courses: catalog.courses.map((c) => (c.id === course.id ? course : c)) });

const putSession = (session: Session) =>
  setCatalog({ ...catalog, sessions: catalog.sessions.map((s) => (s.id === session.id ? session : s)) });

/* ------------------------------- legacy -------------------------------- */

const MONTH_INDEX = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "26 Sep 2026" or "Sat 26 Sep 2026" → "2026-09-26". Null for anything less
 *  certain: "late September" matches nothing, which is the point. */
function isoFromLegacyDate(label: string): string | null {
  const m = /^(?:[a-z]{3,9},?\s+)?(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/i.exec(label.trim());
  if (!m) return null;
  const month = MONTH_INDEX.indexOf(m[2].slice(0, 3).toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Re-points enrolments made against the old demo catalogue at the database
 * rows that replaced it. Runs after every catalogue load and changes nothing
 * once there is nothing left to change.
 *
 * Courses go by slug, which is fixed. Sessions are riskier — a booking moved
 * to the wrong day is worse than one showing no day — so an enrolment moves
 * only when its old session's date is exactly the day of one, and only one,
 * database session of the same course. Anything else keeps the id it had.
 */
function repointLegacy() {
  const d = readLocal();
  // An empty catalogue means the database has not been seeded yet. Keep the
  // old dates for a later load rather than spending their one chance on it.
  if (catalog.courses.length === 0) return;

  const bySlug = new Map(catalog.courses.map((c) => [c.slug, c.id]));
  const courseFor = (courseId: string) => {
    const slug = LEGACY_COURSES[courseId];
    return (slug && bySlug.get(slug)) || courseId;
  };
  const oldSessions = new Map((legacySessions ?? []).map((s) => [s.id, s]));

  let changed = false;
  const enrolments = d.enrolments.map((e) => {
    const courseId = courseFor(e.courseId);
    let sessionId = e.sessionId;
    const old = oldSessions.get(e.sessionId);
    const day = old ? isoFromLegacyDate(old.date) : null;
    if (old && day && courseFor(old.courseId) === courseId) {
      const matches = catalog.sessions.filter((s) => s.courseId === courseId && s.startsOn === day);
      if (matches.length === 1) sessionId = matches[0].id;
    }
    if (courseId === e.courseId && sessionId === e.sessionId) return e;
    changed = true;
    return { ...e, courseId, sessionId };
  });

  // The old dates have had their chance to match. Keeping them any longer
  // would keep a piece of the old catalogue in storage for nothing.
  const hadLegacy = legacySessions !== null;
  legacySessions = null;
  if (changed) writeLocal({ ...d, enrolments });
  else if (hadLegacy) persist();
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

/** The web address a new course with this title would get — unique among
 *  every course, drafts and archived ones included. */
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
  putCourse(after);

  const res = await run<CourseRow>((db) =>
    db.from("courses").update(coursePatchToRow(after, patch)).eq("id", courseId).select().maybeSingle(),
  );
  if (!res.ok) {
    // Undo only this edit. If something newer has replaced the row since,
    // that is more current than either copy held here.
    if (catalog.courses.find((c) => c.id === courseId) === after) putCourse(before);
    return res;
  }
  putCourse(courseFromRow(res.data));
  return { ok: true };
}

/**
 * Deleting a course would orphan its sessions and rewrite enrolment history,
 * so a course in use is archived instead — it leaves the catalogue but every
 * record that points at it stays intact.
 *
 * "In use" is an enrolment in this browser, or one in the database — the
 * website's own sales — which Postgres reports by refusing the delete.
 */
export async function removeCourse(courseId: string): Promise<{ ok: true; archived: boolean } | Failure> {
  const archive = async () => {
    const res = await updateCourse(courseId, { status: "archived" });
    return res.ok ? { ok: true as const, archived: true } : res;
  };
  if (readLocal().enrolments.some((e) => e.courseId === courseId)) return archive();

  const course = catalog.courses.find((c) => c.id === courseId);
  const sessions = catalog.sessions.filter((s) => s.courseId === courseId);
  // Its sessions go with it: the database cascades, and so does the screen.
  setCatalog({
    courses: catalog.courses.filter((c) => c.id !== courseId),
    sessions: catalog.sessions.filter((s) => s.courseId !== courseId),
  });

  const res = await run<{ id: string }[]>((db) => db.from("courses").delete().eq("id", courseId).select("id"), NOT_DELETED);
  if (res.ok) return { ok: true, archived: false };

  // Put back what was taken off, leaving anything changed meanwhile alone.
  setCatalog({
    courses: course && !catalog.courses.some((c) => c.id === courseId) ? [...catalog.courses, course] : catalog.courses,
    sessions: [...catalog.sessions, ...sessions.filter((s) => !catalog.sessions.some((x) => x.id === s.id))],
  });
  return res.error === IN_USE ? archive() : res;
}

/* ------------------------------ sessions ----------------------------- */

export async function createSession(input: SessionInput): Promise<SaveResult> {
  const session: Session = { ...input, id: uuid(), createdAt: new Date().toISOString() };
  setCatalog({ ...catalog, sessions: [...catalog.sessions, session] });

  const res = await run<SessionRow>((db) =>
    db.from("sessions").insert({ id: session.id, ...sessionToRow(session) }).select().single(),
  );
  if (!res.ok) {
    setCatalog({ ...catalog, sessions: catalog.sessions.filter((s) => s.id !== session.id) });
    return res;
  }
  putSession(sessionFromRow(res.data));
  return { ok: true };
}

export async function updateSession(sessionId: string, patch: Partial<SessionInput>): Promise<SaveResult> {
  const before = catalog.sessions.find((s) => s.id === sessionId);
  if (!before) return { ok: false, error: "That session is no longer scheduled. Reload the page." };
  const after: Session = { ...before, ...patch };
  putSession(after);

  const res = await run<SessionRow>((db) =>
    db.from("sessions").update(sessionToRow(after)).eq("id", sessionId).select().maybeSingle(),
  );
  if (!res.ok) {
    if (catalog.sessions.find((s) => s.id === sessionId) === after) putSession(before);
    return res;
  }
  putSession(sessionFromRow(res.data));
  return { ok: true };
}

/** Refuses while anyone is booked on it — here, or in the database. */
export async function removeSession(sessionId: string): Promise<{ ok: true; blocked: boolean } | Failure> {
  if (readLocal().enrolments.some((e) => e.sessionId === sessionId)) return { ok: true, blocked: true };
  const session = catalog.sessions.find((s) => s.id === sessionId);
  if (!session) return { ok: true, blocked: false };
  setCatalog({ ...catalog, sessions: catalog.sessions.filter((s) => s.id !== sessionId) });

  const res = await run<{ id: string }[]>((db) => db.from("sessions").delete().eq("id", sessionId).select("id"), NOT_DELETED);
  if (res.ok) return { ok: true, blocked: false };

  if (!catalog.sessions.some((s) => s.id === sessionId)) setCatalog({ ...catalog, sessions: [...catalog.sessions, session] });
  return res.error === IN_USE ? { ok: true, blocked: true } : res;
}

/* ----------------------------- enrolments ---------------------------- */

export function createEnrolment(input: Omit<Enrolment, "id" | "createdAt">): Enrolment {
  const enrolment: Enrolment = { ...input, id: id("e"), createdAt: new Date().toISOString() };
  const d = readLocal();
  writeLocal({ ...d, enrolments: [enrolment, ...d.enrolments] });
  return enrolment;
}

export function markPaid(enrolmentId: string, paid = true) {
  const d = readLocal();
  writeLocal({ ...d, enrolments: d.enrolments.map((e) => (e.id === enrolmentId ? { ...e, paid } : e)) });
}

export function removeEnrolment(enrolmentId: string) {
  const d = readLocal();
  writeLocal({ ...d, enrolments: d.enrolments.filter((e) => e.id !== enrolmentId) });
}

/* ------------------------------ derived ------------------------------ */

/** Seats taken on a session, counting a corporate booking's full block. */
export const seatsTaken = (d: AdminData, sessionId: string) =>
  d.enrolments.filter((e) => e.sessionId === sessionId).reduce((a, e) => a + e.seats, 0);

export const seatsLeft = (d: AdminData, session: Session) =>
  Math.max(0, session.seats - seatsTaken(d, session.id));

/** Status is derived from real occupancy, so it can never drift from the data.
 *  Draft and closed are editorial states and are left alone. */
export function effectiveStatus(d: AdminData, session: Session): SessionStatusLabel {
  if (session.status === "draft") return "Draft";
  if (session.status === "closed") return "Closed";
  const taken = seatsTaken(d, session.id);
  if (taken >= session.seats) return "Full";
  if (taken / Math.max(1, session.seats) >= 0.75) return "Filling";
  return "Open";
}

export type SessionStatusLabel = "Open" | "Filling" | "Full" | "Draft" | "Closed";

/**
 * Empties this browser's own records — facilitators, enrolments and the
 * certificate settings. Courses and sessions belong to the database, and to
 * the website, so a reset never touches them.
 */
export function resetAll() {
  writeLocal(BLANK());
  if (status.state === "ready") repointLegacy();
}
