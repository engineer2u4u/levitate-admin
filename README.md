# Levitate LMS Admin

Back-office for the Levitate PeopleSoft learning platform: create and manage
courses, schedule sessions against them, and enrol customers who come in by
phone, email or corporate booking.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/
```

## How the model fits together

```
Course  ──<  Session  ──<  Enrolment
```

- **Course** — title, category, fee, duration, status. `draft` is hidden from
  learners, `live` is sellable, `archived` is retired but keeps its history.
- **Session** — a dated run of a course, carrying the facilitator and seat
  count. Enrolments book against a session, not a course.
- **Enrolment** — a customer on a session. Holds `seats`, so a corporate
  booking is one row rather than six.

## Rules worth knowing

**Money is integer paise.** `pricePaise`, `amountPaise` — never a float, so a
fee cannot drift by a rounding error. `inr()` and `rupeesToPaise()` in
`lib/format.ts` convert at the edges.

**Enrolment amounts are snapshotted.** The fee is copied onto the enrolment at
the time it is created, so raising a course price later does not silently
rewrite what past customers owed.

**Session status is derived, not stored.** `Open` / `Filling` / `Full` are
computed from real bookings against capacity, so the badge can never drift from
the data. `Draft` and `Closed` are editorial and left alone.

**Deletes protect history.** A course with enrolments is *archived* rather than
deleted, so nothing is orphaned. A session with people on it refuses to delete
at all. Only genuinely unused records are removed outright.

**Capacity is enforced.** The enrol dialog will not oversell a session, full
sessions are disabled in the picker, and a session's seat count cannot be
edited below the number already booked.

## Data

Everything lives in `localStorage` under `lvt.admin.data.v1`, seeded on first
run from `lib/seed.ts`. All reads and writes go through `lib/store.ts` — that is
the single file to change when a database arrives.

**This data is not shared with the student LMS.** The two are separate origins,
so a course created here does not appear in the learner catalogue. Connecting
them needs one backend behind both; the store is shaped so that becomes a swap
of `lib/store.ts` rather than a rewrite of the screens.

## Deployment

Configured as a static export (`output: "export"`), matching the main site,
since SiteGround has no Node runtime. `out/` uploads to a subdomain or
subfolder.

**It has no authentication.** Anyone with the URL can use it. Before it goes
anywhere public it needs a real login — Supabase Auth with an allow-list, or
HTTP Basic auth at the Apache level as an interim measure.
