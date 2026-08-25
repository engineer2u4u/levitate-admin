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
Facilitator  >──  Course  ──<  Module  ──<  Lesson
                     │            └──────<  Quiz (optional)
                     └──<  Session  ──<  Enrolment
```

- **Facilitator** — name, title, bio and photograph, held once. A course points
  at one by id, so fixing a spelling or swapping a photo updates every course
  carrying them.

- **Course** — title, category, fee, teaching time, tenure, a facilitator,
  banner and status. `draft` is hidden from learners, `live` is sellable, `archived` is
  retired but keeps its history.
- **Module** — a chapter of the course, with a cover image and an ordered list
  of lessons. Ends with a quiz where one earns its place.
- **Lesson** — reading material written in place, a linked video, or a file to
  download. Each can carry an illustration.
- **Quiz** — four options per question, exactly one correct, and a pass mark.
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

## Who can get in

**There is no sign-up.** Accounts exist because an admin invited them from
**Users**, and the invited role rides on the invite.

- **Admin** — everything, including inviting and removing other people.
- **Viewer** — opens every screen, changes nothing. Write buttons are not
  rendered for them, and Row Level Security refuses the write anyway if one
  ever is.

An invite is a row in `admin_invites` plus an emailed link. Opening the link
signs the person in, attaches their role, and stops on a blocking *Choose a
password* step — the link is single-use and the sign-in screen takes nothing
but a password, so an account without one could not get back in. *Revoke* drops
someone back to `learner`: their account survives, but the portal stops opening
for them.

The first admin is made once by hand — the bootstrap is in
[SUPABASE.md](SUPABASE.md), along with what each policy enforces.

**Categories are a fixed list.** `CATEGORIES` in `lib/types.ts`. Typed free, a
course lands in two groups on the learner site and neither looks complete.

**Facilitators are records, not names.** A course stores `facilitatorId`, so
the same person is one entry with one photograph everywhere. Removing someone
who still leads a course is refused, naming the courses to reassign first —
clearing the reference silently would leave courses with no facilitator and
nobody the wiser.

**Images go to Supabase, everything else stays local.** Course text lives in
`localStorage`; a single banner would eat its whole quota, so uploads go to the
`course-media` bucket and only the URL is stored. Recommended sizes are in
`IMAGE_SIZES` and shown next to each upload — advice, not a rule.

**Certificates are SVG, not screenshots.** Both formats are drawn on one
A4-landscape canvas in `CertificateArt.tsx`, so *Download PDF* prints real
vectors and *Download PNG* rasterises through a plain canvas — no PDF library,
nothing to keep patched. The cost is that SVG text does not wrap, which
`wrap()` handles for the one unpredictable field.

**Sending a certificate sends a link.** Neither `mailto:` nor `wa.me` can carry
an attachment, and there is no backend to hand a file to. The certificate is
uploaded to Supabase Storage under an opaque random filename — the bucket's read
policy also permits `list()` with the public key, so a name in the path would
make every certified person enumerable.

**Live sessions are described twice, deliberately.** The course says how many
live sessions the fee includes and roughly when they run. **Sessions** is the
actual dated schedule people book against. One is the offer, the other is the
calendar.

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

Sign-in needs Supabase configured — see [SUPABASE.md](SUPABASE.md). Add the
deployed admin origin to **Redirect URLs** in the Supabase dashboard, or invite
links will land on the learner site instead of here.
