/** Domain model for the Levitate LMS admin. */

export type CourseStatus = "live" | "draft" | "archived";

export type Course = {
  id: string;
  title: string;
  category: string;
  /** Fee in paise — money is never held as a float. */
  pricePaise: number;
  duration: string;
  description: string;
  status: CourseStatus;
  createdAt: string;
};

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
  courses: Course[];
  sessions: Session[];
  enrolments: Enrolment[];
};
