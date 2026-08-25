/** Domain model for the Levitate LMS admin. */

export type CourseStatus = "live" | "draft" | "archived";

/**
 * The catalogue's categories, fixed rather than free text.
 *
 * Typed twice, a course lands in two groups on the learner site and neither
 * looks complete. Adding one here is a deliberate act; adding one by typo is
 * not possible.
 */
export const CATEGORIES = [
  "POSH · Train-the-Trainer",
  "POCSO · Train-the-Trainer",
  "DEI · Train-the-Trainer",
  "Wellbeing · Train-the-Trainer",
  "Compliance · Workshop",
  "Leadership · Workshop",
] as const;

export type Category = (typeof CATEGORIES)[number];

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
};

/* ----------------------------- certificates ----------------------------- */

export type CertificateTemplate = "shrm" | "excellence";

export const CERTIFICATE_TEMPLATES: { key: CertificateTemplate; label: string; sub: string }[] = [
  { key: "shrm", label: "SHRM Recertification", sub: "Formal, bordered, carries a PDC count" },
  { key: "excellence", label: "Award of Excellence", sub: "Levitate house style, two signatories" },
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
  modules: Module[];
  status: CourseStatus;
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

export type SessionStatus = "open" | "filling" | "full" | "draft" | "closed";

export type Session = {
  id: string;
  courseId: string;
  date: string;
  time: string;
  /** "Online · Zoom" or "Onsite · Bengaluru". */
  mode: string;
  trainer: string;
  seats: number;
  status: SessionStatus;
  createdAt: string;
};

export type PaymentMethod = "link" | "invoice" | "paid";

export type Enrolment = {
  id: string;
  name: string;
  email: string;
  phone: string;
  courseId: string;
  sessionId: string;
  /** Where the enrolment came from — phone enquiries are created here. */
  source: "Phone" | "Website" | "Corporate";
  /** Snapshotted at enrolment: a later price change must not rewrite history. */
  amountPaise: number;
  /** Number of seats, so a corporate booking is one row. */
  seats: number;
  method: PaymentMethod;
  paid: boolean;
  createdAt: string;
};

export type AdminData = {
  certificate: CertificateSettings;
  facilitators: Facilitator[];
  courses: Course[];
  sessions: Session[];
  enrolments: Enrolment[];
};

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
