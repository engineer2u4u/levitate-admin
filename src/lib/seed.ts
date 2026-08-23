import type { AdminData } from "./types";

/**
 * Seed data, written once on first run so the admin is not an empty shell.
 * Courses mirror the live Levitate catalogue; the enrolments are illustrative.
 * Fixed ids and timestamps keep it deterministic across reloads.
 */
const t = (d: string) => new Date(d + "T00:00:00.000Z").toISOString();

export const SEED: AdminData = {
  courses: [
    { id: "c_posh", title: "Certified POSH Trainer Programme", category: "POSH · Train-the-Trainer", pricePaise: 1500000, duration: "12 hours", description: "Build legal understanding, inquiry competence and POSH facilitation skills across 11 practice-led modules.", status: "live", createdAt: t("2026-06-01") },
    { id: "c_pocso", title: "Certified POCSO & Child Safety Facilitator", category: "POCSO · Train-the-Trainer", pricePaise: 1300000, duration: "6 hours", description: "Facilitate child-safety awareness with sensitivity, legal clarity and responsible communication.", status: "live", createdAt: t("2026-06-04") },
    { id: "c_dei", title: "Certified Inclusive Workplace Facilitator", category: "DEI · Train-the-Trainer", pricePaise: 1400000, duration: "12 hours", description: "Lead conversations on inclusion, unconscious bias, belonging and psychological safety.", status: "draft", createdAt: t("2026-06-18") },
    { id: "c_well", title: "Certified Workplace Wellbeing Facilitator", category: "Wellbeing · Train-the-Trainer", pricePaise: 1400000, duration: "12 hours", description: "Facilitate workplace mental-health conversations with confidence, sensitivity and ethical care.", status: "draft", createdAt: t("2026-06-22") },
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
