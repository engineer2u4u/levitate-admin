/** Domain model for the Levitate LMS admin. */

export type CourseStatus = "live" | "draft" | "archived";

/* ------------------------------- lessons ------------------------------- */

export type LessonKind = "reading" | "video" | "resource";

export const LESSON_KINDS: { key: LessonKind; label: string; sub: string }[] = [
  { key: "reading", label: "Reading", sub: "Written material learners read in place" },
  { key: "video", label: "Video", sub: "A recording, linked from wherever it is hosted" },
  { key: "resource", label: "Resource", sub: "A download — handout, template, checklist" },
];

export type Lesson = {
  id: string;
  title: string;
  kind: LessonKind;
  /** Reading material. Plain text with blank lines between paragraphs. */
  body: string;
  /** Illustration shown with the lesson. Uploaded to Supabase Storage. */
  imageUrl: string;
  /** Where a video or download lives. Not used by `reading`. */
  url: string;
};

/* -------------------------------- quizzes ------------------------------- */

export type QuizQuestion = {
  id: string;
  prompt: string;
  /** Always four, so every question renders identically on the learner site. */
  options: string[];
  /** Index into `options`. */
  answerIndex: number;
};

export type Quiz = {
  /** Percentage needed to pass, 0–100. */
  passPercent: number;
  questions: QuizQuestion[];
};

/* -------------------------------- modules ------------------------------- */

export type Module = {
  id: string;
  title: string;
  summary: string;
  imageUrl: string;
  lessons: Lesson[];
  /** Null where a module does not warrant one — quizzes are optional. */
  quiz: Quiz | null;
  /**
   * The LMS lessons inside this module, by id. Present only where the lesson
   * content is written in the website's code (PoSH): the ids there and here
   * have to match, so such a module's id cannot change and the list cannot
   * gain or lose modules from this screen.
   */
  itemIds?: string[];
  /** "enrolment": open as soon as someone is enrolled. "manual": waits for an
   *  admin to unlock it for the batch after a live session. */
  release?: "enrolment" | "manual";
};

/** True when a course's modules mirror lesson content in the website's code,
 *  and so can be renamed here but not added, removed or reordered. */
export const modulesFromWebsite = (modules: Module[]) => modules.some((m) => (m.itemIds?.length ?? 0) > 0);

/* ----------------------------- certificates ----------------------------- */

export type CertificateTemplate = "shrm" | "excellence" | "cpd";

export const CERTIFICATE_TEMPLATES: { key: CertificateTemplate; label: string; sub: string }[] = [
  { key: "shrm", label: "SHRM Recertification", sub: "Formal, bordered, carries a PDC count" },
  { key: "excellence", label: "Award of Excellence", sub: "Levitate house style, two signatories" },
  { key: "cpd", label: "CPD Certificate", sub: "The CPD Certification Service format, A4 portrait, carries CPD hours" },
];

/**
 * Branding that is the same on every certificate: the marks, the signatures,
 * and who signs. Held once and edited in one place, so a new signature does
 * not mean re-uploading it per certificate.
 *
 * Every image is optional. Each has a fallback that reads as deliberate rather
 * than broken, because a certificate half-configured still gets printed.
 */
export type CertificateSettings = {
  orgName: string;
  website: string;
  /** Levitate wordmark, top centre on the Award template. */
  logoUrl: string;
  /** Gold award seal on the Award template's left panel. */
  sealUrl: string;
  /** SHRM Recertification Provider badge, top left on the SHRM template. */
  accreditationLogoUrl: string;
  /** The "Recognised by" logo row, exported as one strip. */
  recognitionStripUrl: string;
  /** Full-bleed ornamental border for the SHRM template. Falls back to a
   *  drawn frame when absent. */
  borderUrl: string;
  /**
   * The finished artwork for each format, used as a full-bleed background.
   *
   * This is the only way a certificate comes out identical to the design: the
   * trademarks, the engraved border and the signatures are artwork, and code
   * that redraws them is always an approximation. With a plate set, nothing is
   * drawn except the fields that change.
   */
  shrmPlateUrl: string;
  excellencePlateUrl: string;
  cpdPlateUrl: string;
  /**
   * True when the plates still carry their specimen text — "[Name of
   * Recipient]", "Your Name Here". Paints a patch over each such area before
   * writing the real value. Only works where the artwork behind is flat, so a
   * clean plate is always better.
   */
  plateHasSampleText: boolean;
  primarySignatureUrl: string;
  primaryName: string;
  primaryTitle: string;
  /** The Award template prints two signatories; leave blank for one. */
  secondSignatureUrl: string;
  secondName: string;
  secondTitle: string;
  /** The line under the course title on the Award format. Editable because it
   *  names the statute, and only the POSH courses sit under that one. */
  closingNote: string;
  /** Boilerplate under the SHRM template's rule. */
  accreditationNote: string;
};

/** What changes per certificate. Never stored — typed, previewed, printed. */
export type CertificateIssue = {
  template: CertificateTemplate;
  recipientName: string;
  courseName: string;
  completedOn: string;
  hours: string;
  pdcs: string;
  /** "No. CPD Hours/ Points" on the CPD format. */
  cpdHours: string;
  certificateId: string;
};

/* ----------------------------- facilitators ----------------------------- */

/**
 * Someone who teaches. Held once and pointed at by id, so correcting a name or
 * swapping a photo updates every course carrying them rather than leaving the
 * old spelling scattered across the catalogue.
 */
export type Facilitator = {
  id: string;
  name: string;
  /** Their standing, e.g. "Lead POSH Trainer". Shown under the name. */
  title: string;
  /** A short bio for the course page. */
  description: string;
  imageUrl: string;
  createdAt: string;
};

/* -------------------------------- courses ------------------------------- */

/** What a published course offers. `status` decides whether it is published
 *  at all; this decides what a visitor can do about it. */
export type SiteStatus = "enrolling" | "waitlist";

/** One line on an Upcoming Batches card: "Batch starts" — "{starts}". */
export type BatchRow = { k: string; v: string };

/** The course's card on the website's Upcoming Batches list. */
export type CourseBatch = {
  /** Whether the course appears on that list at all. */
  show: boolean;
  tag: string;
  title: string;
  short: string;
  statusLabel: string;
  rows: BatchRow[];
  feeNote: string;
  /** The button's text, e.g. "Enrol for this batch". */
  cta: string;
};

export type Course = {
  id: string;
  title: string;
  category: string;
  /** Fee in paise — money is never held as a float. */
  pricePaise: number;
  /** Teaching time, e.g. "12 hours". */
  duration: string;
  /** Calendar span the course runs over, e.g. "6 weeks". */
  tenure: string;
  /** Points at a Facilitator. Empty until one is chosen; individual sessions
   *  may still name someone else. */
  facilitatorId: string;
  /** How many live sessions the fee includes. */
  liveSessionCount: number;
  /** When those live sessions run, e.g. "Saturdays, 10:00–13:00 IST". */
  liveSessionSchedule: string;
  description: string;
  /** Catalogue banner. Uploaded to Supabase Storage; empty until one is set. */
  bannerUrl: string;
  /** The brochure a visitor downloads. A PDF in the course-media bucket, or
   *  empty where the course has none. */
  brochureUrl: string;
  modules: Module[];
  status: CourseStatus;
  /**
   * Its address on the website, e.g. "posh-trainer". Made from the title when
   * the course is created and never changed afterwards: the site, its sitemap
   * and every link anyone has shared address the course by it.
   */
  slug: string;

  /* ---- what the public website prints ---- */

  /** "PoSH Train-the-Trainer": the name in the nav, cards and bars. */
  short: string;
  /** The small label on a catalogue card. */
  tag: string;
  /** "Live online · Weekend batch". May contain placeholders. */
  mode: string;
  siteStatus: SiteStatus;
  /** Published and reachable, but kept out of the nav, catalogue and sitemap. */
  hidden: boolean;
  /** No fee set yet: the site shows "On request" and takes no payment. */
  priceOnRequest: boolean;
  /** "incl. taxes · from {starts_short}". May contain placeholders. */
  priceNote: string;
  /** The struck-through "standard fee" beside a discounted one. Never charged. */
  listPricePaise: number | null;
  modulesLabel: string;
  hoursLabel: string;
  /** The facilitator as the site prints them. Copied from the chosen
   *  facilitator on save, because those records live only in this browser. */
  facilitatorName: string;
  /** Card image: a path on the site ("/assets/…") or a full URL. */
  image: string;
  /** Lower comes first on the website. */
  sortOrder: number;
  /** Shown as the start while the course has no dated session: "October 2026". */
  startsLabel: string;
  batch: CourseBatch;
  createdAt: string;
};

/** Recommended pixel sizes, shown next to each upload and enforced nowhere —
 *  an off-size image still works, it just crops less predictably. */
export const IMAGE_SIZES = {
  banner: { w: 1600, h: 600, label: "1600 × 600 px (8:3)" },
  module: { w: 1200, h: 675, label: "1200 × 675 px (16:9)" },
  lesson: { w: 1200, h: 675, label: "1200 × 675 px (16:9)" },
  facilitator: { w: 600, h: 600, label: "600 × 600 px (square)" },
  logo: { w: 600, h: 180, label: "600 × 180 px, transparent PNG" },
  seal: { w: 500, h: 500, label: "500 × 500 px, transparent PNG" },
  signature: { w: 500, h: 200, label: "500 × 200 px, transparent PNG" },
  strip: { w: 1400, h: 200, label: "1400 × 200 px, transparent PNG" },
  certBorder: { w: 2246, h: 1588, label: "2246 × 1588 px (A4 landscape)" },
} as const;

/* -------------------------------- batches ------------------------------- */

export type BatchStatus = "upcoming" | "running" | "completed" | "cancelled";

/**
 * One run of a course: the October batch, then the November one. Its own
 * sessions, seats and learners, and a status that keeps finished runs as
 * history rather than deleting them.
 */
export type Batch = {
  id: string;
  courseId: string;
  /** "October 2026". */
  name: string;
  /** "2026-10". Unique within a course when set. */
  code: string;
  startsOn: string | null;
  endsOn: string | null;
  status: BatchStatus;
  /** Taking new enrolments — separate from status, so a running batch can
   *  still take a late joiner. */
  enrolmentOpen: boolean;
  seats: number;
  completedAt: string | null;
  createdAt: string;
};

export type BatchInput = Omit<Batch, "id" | "createdAt" | "completedAt">;

export const BATCH_STATUSES: { key: BatchStatus; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export type SessionStatus = "open" | "filling" | "full" | "draft" | "closed";

export type Session = {
  id: string;
  courseId: string;
  batchId: string;
  /** The day it runs, "2026-10-03". What sessions sort by, and what `date`
   *  is generated from. Null only on a row made without one. */
  startsOn: string | null;
  /** The day as printed, "Sat 3 Oct 2026". */
  date: string;
  /** The timing as printed, "6:00 – 8:00 PM IST". Free text. */
  time: string;
  /** "Online · Zoom" or "Onsite · Bengaluru". */
  mode: string;
  trainer: string;
  seats: number;
  status: SessionStatus;
  /** What the session covers. Optional. */
  topic: string;
  /** The exact start and end, where the minute matters — the masterclass
   *  stops taking payment at `startsAt`. ISO timestamps, or null. */
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

/** A session's Zoom details. Kept apart from the session because the public
 *  website reads sessions with the anon key, and these must never be public. */
export type SessionLink = {
  sessionId: string;
  joinUrl: string;
  meetingId: string;
  passcode: string;
  recordingUrl: string;
};

export type EnrolmentStatus = "pending" | "paid" | "cancelled";

export type PaymentMethod = "razorpay" | "link" | "invoice" | "offline";

export type Enrolment = {
  id: string;
  /** The learner's LMS account, once they have claimed this enrolment with
   *  its code — or bought it while signed in. */
  userId: string | null;
  /** "LVT-7K3QXM": sent to the learner, entered once on the LMS to attach
   *  this enrolment to their account. Blank until the database assigns it. */
  claimCode: string;
  name: string;
  email: string;
  phone: string;
  courseId: string;
  batchId: string;
  /** Admin: added here. Website: bought on the LMS. */
  source: "Admin" | "Website" | "Phone" | "Corporate";
  /** Snapshotted at enrolment: a later price change must not rewrite history. */
  amountPaise: number;
  seats: number;
  method: PaymentMethod;
  status: EnrolmentStatus;
  /** The Razorpay payment link pasted in, to forward on WhatsApp or email. */
  paymentLink: string;
  paidAt: string | null;
  cancelledAt: string | null;
  linkedAt: string | null;
  completedAt: string | null;
  certificateSentAt: string | null;
  toolkitSentAt: string | null;
  notes: string;
  createdAt: string;
};

/** What the enrol form supplies; the database stamps the rest. */
export type EnrolmentInput = Pick<
  Enrolment,
  "name" | "email" | "phone" | "batchId" | "courseId" | "source" | "amountPaise" | "seats" | "method" | "status" | "paymentLink" | "notes"
>;

/** An enrolment from before they moved to the database, still sitting in
 *  some browser's storage. Read only, to be downloaded before it is cleared. */
export type LegacyEnrolment = {
  id: string;
  name: string;
  email: string;
  phone: string;
  courseId: string;
  sessionId: string;
  source: string;
  amountPaise: number;
  seats: number;
  method: string;
  paid: boolean;
  createdAt: string;
};

/** A module opened for everyone in a batch, usually after a live session. */
export type ModuleUnlock = {
  batchId: string;
  moduleId: string;
  unlockedAt: string;
  afterSessionId: string | null;
};

/** One learner's progress through one course, as the LMS records it. */
export type LearnerProgress = {
  userId: string;
  courseSlug: string;
  completedItems: string[];
  completedAt: string | null;
  updatedAt: string;
};

export type AdminData = {
  certificate: CertificateSettings;
  facilitators: Facilitator[];
  courses: Course[];
  batches: Batch[];
  sessions: Session[];
  sessionLinks: SessionLink[];
  enrolments: Enrolment[];
  moduleUnlocks: ModuleUnlock[];
  progress: LearnerProgress[];
};

/** The part of `AdminData` held in this browser. Everything else is the
 *  database's, and never stored locally. */
export type LocalData = Pick<AdminData, "certificate" | "facilitators">;

/** A course as the form edits it: everything but what is fixed on creation. */
export type CourseInput = Omit<Course, "id" | "slug" | "createdAt">;

export type SessionInput = Omit<Session, "id" | "createdAt">;

/* -------------------------------- factories ----------------------------- */

const rid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyLesson = (): Lesson => ({
  id: rid("l"),
  title: "",
  kind: "reading",
  body: "",
  imageUrl: "",
  url: "",
});

export const emptyQuestion = (): QuizQuestion => ({
  id: rid("q"),
  prompt: "",
  options: ["", "", "", ""],
  answerIndex: 0,
});

export const emptyQuiz = (): Quiz => ({ passPercent: 70, questions: [emptyQuestion()] });

export const emptyModule = (): Module => ({
  id: rid("m"),
  title: "",
  summary: "",
  imageUrl: "",
  lessons: [],
  quiz: null,
});

export const emptyBatch = (): CourseBatch => ({
  show: false,
  tag: "",
  title: "",
  short: "",
  statusLabel: "",
  rows: [],
  feeNote: "",
  cta: "",
});

/**
 * The course's "15 modules" label, with the number brought up to date.
 *
 * The label is the website's copy and the form does not edit it, but the form
 * does change how many modules there are — so a card can end up claiming 15
 * over a syllabus of 16. Only a number already in the label is rewritten:
 * "Curriculum on request" says something true about a course with no syllabus
 * yet, and turning it into "0 modules" would not.
 */
export function modulesLabelFor(label: string, count: number) {
  return /[0-9]+/.test(label) ? label.replace(/[0-9]+/, String(count)) : label;
}

/* ------------------------------ batch cards ----------------------------- */

/**
 * The course's card on the website's Upcoming Batches list, worked out from
 * the course itself.
 *
 * Publishing a course is the whole instruction: set it live and it appears on
 * that list, with its own details, rather than being live on the site and
 * missing from the batches page because a separate tickbox was never found.
 *
 * Three fields always follow the course, because they state what it is doing
 * and an admin can change that here: whether it is listed at all, the status
 * it shows, and what its button says. The rest is card copy — kept wherever
 * someone has written it, and filled in from the course where they have not.
 */
export function batchCardFor(
  c: Pick<Course, "title" | "short" | "category" | "status" | "siteStatus" | "hidden" | "mode" | "duration" | "tenure" | "liveSessionSchedule" | "priceOnRequest" | "modules"> & { batch: CourseBatch },
): CourseBatch {
  const b = c.batch;
  const enrolling = c.siteStatus === "enrolling";
  const name = c.short.trim() || c.title.trim();

  // Written where someone has written it; worked out where they have not.
  const rows = b.rows.length
    ? b.rows
    : ([
        // The website fills {starts} from the first dated session, falling
        // back to the course's own start.
        { k: enrolling ? "Batch starts" : "Batch month", v: "{starts}" },
        { k: "Duration", v: c.tenure.trim() || c.duration.trim() },
        { k: "Curriculum", v: c.modules.length ? `${c.modules.length} module${c.modules.length === 1 ? "" : "s"}` : "" },
        { k: "Timing", v: c.liveSessionSchedule.trim() },
        { k: "Mode", v: c.mode.trim() },
      ] as BatchRow[]).filter((r) => r.v);

  return {
    // Hidden courses are deliberately off every public list, this one included.
    show: c.status === "live" && !c.hidden,
    statusLabel: enrolling ? "Enrolling" : "Dates coming soon",
    cta: enrolling ? "Enrol for this batch" : "Join the waitlist",
    tag: b.tag.trim() || name || c.category.trim(),
    title: b.title.trim() || name,
    short: b.short.trim() || name,
    rows,
    feeNote: b.feeNote.trim() || (c.priceOnRequest ? "confirmed with batch dates" : "inclusive of taxes"),
  };
}
