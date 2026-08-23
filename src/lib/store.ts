import type { AdminData, Course, Enrolment, Session } from "./types";
import { SEED } from "./seed";

/**
 * Persistence for the admin.
 *
 * Everything goes through this module so there is exactly one place to swap
 * when a database arrives: replace the read/write pair with Supabase calls and
 * no screen changes. Until then it is localStorage, which means the data is
 * per-browser and is *not* shared with the student LMS.
 */
const KEY = "lvt.admin.data.v1";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb) as unknown as void;
};

/** Parsed data is cached so repeated reads return the same reference —
 *  useSyncExternalStore compares snapshots by identity. */
let cache: AdminData | null = null;

export const EMPTY: AdminData = { courses: [], sessions: [], enrolments: [] };

export function read(): AdminData {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as AdminData) : SEED;
    if (!raw) window.localStorage.setItem(KEY, JSON.stringify(SEED));
  } catch {
    cache = SEED;
  }
  return cache;
}

function write(next: AdminData) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode — changes will not survive a reload */
  }
  emit();
}

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ------------------------------ courses ------------------------------ */

export function createCourse(input: Omit<Course, "id" | "createdAt">): Course {
  const course: Course = { ...input, id: id("c"), createdAt: new Date().toISOString() };
  const d = read();
  write({ ...d, courses: [course, ...d.courses] });
  return course;
}

export function updateCourse(courseId: string, patch: Partial<Omit<Course, "id" | "createdAt">>) {
  const d = read();
  write({ ...d, courses: d.courses.map((c) => (c.id === courseId ? { ...c, ...patch } : c)) });
}

/**
 * Deleting a course would orphan its sessions and rewrite enrolment history,
 * so a course in use is archived instead — it leaves the catalogue but every
 * record that points at it stays intact.
 */
export function removeCourse(courseId: string): { archived: boolean } {
  const d = read();
  const inUse = d.enrolments.some((e) => e.courseId === courseId);
  if (inUse) {
    updateCourse(courseId, { status: "archived" });
    return { archived: true };
  }
  write({
    ...d,
    courses: d.courses.filter((c) => c.id !== courseId),
    sessions: d.sessions.filter((s) => s.courseId !== courseId),
  });
  return { archived: false };
}

/* ------------------------------ sessions ----------------------------- */

export function createSession(input: Omit<Session, "id" | "createdAt">): Session {
  const session: Session = { ...input, id: id("s"), createdAt: new Date().toISOString() };
  const d = read();
  write({ ...d, sessions: [...d.sessions, session] });
  return session;
}

export function updateSession(sessionId: string, patch: Partial<Omit<Session, "id" | "createdAt">>) {
  const d = read();
  write({ ...d, sessions: d.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)) });
}

export function removeSession(sessionId: string): { blocked: boolean } {
  const d = read();
  if (d.enrolments.some((e) => e.sessionId === sessionId)) return { blocked: true };
  write({ ...d, sessions: d.sessions.filter((s) => s.id !== sessionId) });
  return { blocked: false };
}

/* ----------------------------- enrolments ---------------------------- */

export function createEnrolment(input: Omit<Enrolment, "id" | "createdAt">): Enrolment {
  const enrolment: Enrolment = { ...input, id: id("e"), createdAt: new Date().toISOString() };
  const d = read();
  write({ ...d, enrolments: [enrolment, ...d.enrolments] });
  return enrolment;
}

export function markPaid(enrolmentId: string, paid = true) {
  const d = read();
  write({ ...d, enrolments: d.enrolments.map((e) => (e.id === enrolmentId ? { ...e, paid } : e)) });
}

export function removeEnrolment(enrolmentId: string) {
  const d = read();
  write({ ...d, enrolments: d.enrolments.filter((e) => e.id !== enrolmentId) });
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

/** Reset to the seeded demo data. */
export function resetAll() {
  write(SEED);
}
