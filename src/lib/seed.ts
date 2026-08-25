import type { AdminData, Module } from "./types";
import { DEFAULT_CERTIFICATE } from "./certificate";

/**
 * Seed data, written once on first run so the admin is not an empty shell.
 * Courses mirror the live Levitate catalogue; the enrolments are illustrative.
 * Fixed ids and timestamps keep it deterministic across reloads.
 */
const t = (d: string) => new Date(d + "T00:00:00.000Z").toISOString();

/** One course ships with its modules filled in, so the module → lesson → quiz
 *  flow has something to show on a fresh install rather than an empty tab. */
const POSH_MODULES: Module[] = [
  {
    id: "m_posh_law",
    title: "The legal framework of the POSH Act",
    summary: "What the 2013 Act requires, who it covers, and the duties it places on an employer.",
    imageUrl: "",
    lessons: [
      {
        id: "l_posh_scope",
        title: "Scope and definitions",
        kind: "reading",
        body:
          "The Act applies to every workplace, and to every woman in it — employee, contractor, intern or visitor.\n\n" +
          "Understanding who counts as an aggrieved woman, and what counts as a workplace, is where most inquiries either start well or go wrong.",
        imageUrl: "",
        url: "",
      },
      {
        id: "l_posh_duties",
        title: "Employer duties, in order",
        kind: "reading",
        body:
          "Constituting an Internal Committee, publishing the policy, running awareness sessions, and filing the annual return.\n\n" +
          "Each has a deadline, and each is the sort of thing that is easy to leave half-done.",
        imageUrl: "",
        url: "",
      },
    ],
    quiz: {
      passPercent: 70,
      questions: [
        {
          id: "q_posh_ic",
          prompt: "Within how many days must an Internal Committee complete its inquiry?",
          options: ["30 days", "60 days", "90 days", "180 days"],
          answerIndex: 2,
        },
        {
          id: "q_posh_who",
          prompt: "Who may bring a complaint under the Act?",
          options: [
            "Only permanent employees",
            "Any woman at the workplace, including interns and visitors",
            "Only women who report to the respondent",
            "Only employees with over a year of service",
          ],
          answerIndex: 1,
        },
      ],
    },
  },
  {
    id: "m_posh_facilitate",
    title: "Facilitating the session",
    summary: "Running the room: handling disclosure, discomfort and the questions that derail a session.",
    imageUrl: "",
    lessons: [
      {
        id: "l_posh_room",
        title: "Holding a difficult room",
        kind: "reading",
        body:
          "A POSH session is not a lecture. Someone in the room has usually lived some part of it.\n\n" +
          "Set the ground rules first, name what will not be discussed in the open, and give people a route to speak to you afterwards.",
        imageUrl: "",
        url: "",
      },
    ],
    quiz: null,
  },
];

export const SEED: AdminData = {
  certificate: DEFAULT_CERTIFICATE,
  facilitators: [
    { id: "f_parichita", name: "Parichita Kotnala", title: "Lead POSH Trainer", description: "Sixteen years across HR and workplace law, and the author of Levitate's POSH curriculum. Has chaired inquiries as an external member for organisations from twelve to twelve thousand people.", imageUrl: "", createdAt: t("2026-05-20") },
    { id: "f_faculty", name: "Levitate faculty", title: "Practitioner panel", description: "A rotating panel of practising lawyers, clinical psychologists and facilitators, drawn on according to the subject being taught.", imageUrl: "", createdAt: t("2026-05-20") },
  ],
  courses: [
    { id: "c_posh", title: "Certified POSH Trainer Programme", category: "POSH · Train-the-Trainer", pricePaise: 1500000, duration: "12 hours", description: "Build legal understanding, inquiry competence and POSH facilitation skills across 11 practice-led modules.", tenure: "6 weeks", facilitatorId: "f_parichita", liveSessionCount: 4, liveSessionSchedule: "Saturdays, 10:00–13:00 IST", bannerUrl: "", modules: POSH_MODULES, status: "live", createdAt: t("2026-06-01") },
    { id: "c_pocso", title: "Certified POCSO & Child Safety Facilitator", category: "POCSO · Train-the-Trainer", pricePaise: 1300000, duration: "6 hours", description: "Facilitate child-safety awareness with sensitivity, legal clarity and responsible communication.", tenure: "3 weeks", facilitatorId: "f_faculty", liveSessionCount: 2, liveSessionSchedule: "Fridays, 18:00–20:00 IST", bannerUrl: "", modules: [], status: "live", createdAt: t("2026-06-04") },
    { id: "c_dei", title: "Certified Inclusive Workplace Facilitator", category: "DEI · Train-the-Trainer", pricePaise: 1400000, duration: "12 hours", description: "Lead conversations on inclusion, unconscious bias, belonging and psychological safety.", tenure: "6 weeks", facilitatorId: "f_faculty", liveSessionCount: 4, liveSessionSchedule: "", bannerUrl: "", modules: [], status: "draft", createdAt: t("2026-06-18") },
    { id: "c_well", title: "Certified Workplace Wellbeing Facilitator", category: "Wellbeing · Train-the-Trainer", pricePaise: 1400000, duration: "12 hours", description: "Facilitate workplace mental-health conversations with confidence, sensitivity and ethical care.", tenure: "6 weeks", facilitatorId: "f_faculty", liveSessionCount: 4, liveSessionSchedule: "", bannerUrl: "", modules: [], status: "draft", createdAt: t("2026-06-22") },
  ],
  sessions: [
    { id: "s_posh_sep", courseId: "c_posh", date: "26 Sep 2026", time: "6:00 – 8:00 PM IST", mode: "Online · Zoom", trainer: "Parichita Kotnala", seats: 25, status: "open", createdAt: t("2026-07-02") },
    { id: "s_pocso_sep", courseId: "c_pocso", date: "18 Sep 2026", time: "6:00 – 8:00 PM IST", mode: "Online · Zoom", trainer: "Levitate faculty", seats: 20, status: "open", createdAt: t("2026-07-02") },
    { id: "s_posh_oct", courseId: "c_posh", date: "24 Oct 2026", time: "10:00 – 16:00 IST", mode: "Onsite · Gurugram", trainer: "Parichita Kotnala", seats: 18, status: "open", createdAt: t("2026-07-11") },
    { id: "s_dei_oct", courseId: "c_dei", date: "09 Oct 2026", time: "11:00 – 15:00 IST", mode: "Online · Zoom", trainer: "Levitate faculty", seats: 20, status: "draft", createdAt: t("2026-07-15") },
  ],
  enrolments: [
    { id: "e_1", name: "Ananya Rao", email: "ananya.rao@example.com", phone: "+91 98450 21188", courseId: "c_posh", sessionId: "s_posh_sep", source: "Phone", amountPaise: 1500000, seats: 1, method: "link", paid: false, createdAt: t("2026-08-02") },
    { id: "e_2", name: "Vikram Shetty", email: "vikram@nexuslabs.in", phone: "+91 99801 44120", courseId: "c_pocso", sessionId: "s_pocso_sep", source: "Website", amountPaise: 1300000, seats: 1, method: "link", paid: true, createdAt: t("2026-08-05") },
    { id: "e_3", name: "Meera Iyer", email: "meera.iyer@example.com", phone: "+91 99000 77451", courseId: "c_posh", sessionId: "s_posh_sep", source: "Phone", amountPaise: 1500000, seats: 1, method: "paid", paid: true, createdAt: t("2026-08-08") },
    { id: "e_4", name: "Nexus Labs", email: "hr@nexuslabs.in", phone: "+91 80471 22900", courseId: "c_posh", sessionId: "s_posh_oct", source: "Corporate", amountPaise: 9000000, seats: 6, method: "invoice", paid: false, createdAt: t("2026-08-12") },
    { id: "e_5", name: "Dev Malhotra", email: "dev.m@vertexhr.com", phone: "+91 98110 24567", courseId: "c_pocso", sessionId: "s_pocso_sep", source: "Website", amountPaise: 1300000, seats: 1, method: "link", paid: true, createdAt: t("2026-08-14") },
  ],
};
