import type { LocalData } from "./types";
import { DEFAULT_CERTIFICATE } from "./certificate";

/**
 * Seed data for this browser's own records, written once on first run so the
 * admin is not an empty shell. Fixed ids and timestamps keep it deterministic
 * across reloads.
 *
 * Courses and sessions are not here: they live in the database, and the real
 * ones are in migration 0009. The enrolments are illustrative and still name
 * the old demo course ids (`c_posh`…) — the store re-points those at the
 * database's courses once they load. The demo sessions they were booked on
 * have no counterpart there, so those enrolments show no date.
 */
const t = (d: string) => new Date(d + "T00:00:00.000Z").toISOString();

export const SEED: LocalData = {
  certificate: DEFAULT_CERTIFICATE,
  facilitators: [
    { id: "f_parichita", name: "Parichita Kotnala", title: "Lead POSH Trainer", description: "Sixteen years across HR and workplace law, and the author of Levitate's POSH curriculum. Has chaired inquiries as an external member for organisations from twelve to twelve thousand people.", imageUrl: "", createdAt: t("2026-05-20") },
    { id: "f_faculty", name: "Levitate faculty", title: "Practitioner panel", description: "A rotating panel of practising lawyers, clinical psychologists and facilitators, drawn on according to the subject being taught.", imageUrl: "", createdAt: t("2026-05-20") },
  ],
  enrolments: [
    { id: "e_1", name: "Ananya Rao", email: "ananya.rao@example.com", phone: "+91 98450 21188", courseId: "c_posh", sessionId: "s_posh_sep", source: "Phone", amountPaise: 1500000, seats: 1, method: "link", paid: false, createdAt: t("2026-08-02") },
    { id: "e_2", name: "Vikram Shetty", email: "vikram@nexuslabs.in", phone: "+91 99801 44120", courseId: "c_pocso", sessionId: "s_pocso_sep", source: "Website", amountPaise: 1300000, seats: 1, method: "link", paid: true, createdAt: t("2026-08-05") },
    { id: "e_3", name: "Meera Iyer", email: "meera.iyer@example.com", phone: "+91 99000 77451", courseId: "c_posh", sessionId: "s_posh_sep", source: "Phone", amountPaise: 1500000, seats: 1, method: "paid", paid: true, createdAt: t("2026-08-08") },
    { id: "e_4", name: "Nexus Labs", email: "hr@nexuslabs.in", phone: "+91 80471 22900", courseId: "c_posh", sessionId: "s_posh_oct", source: "Corporate", amountPaise: 9000000, seats: 6, method: "invoice", paid: false, createdAt: t("2026-08-12") },
    { id: "e_5", name: "Dev Malhotra", email: "dev.m@vertexhr.com", phone: "+91 98110 24567", courseId: "c_pocso", sessionId: "s_pocso_sep", source: "Website", amountPaise: 1300000, seats: 1, method: "link", paid: true, createdAt: t("2026-08-14") },
  ],
};
