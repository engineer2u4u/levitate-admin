# Connecting to Supabase

One Supabase project sits behind both apps: the admin writes the catalogue, the
learner site reads it. Until the two values below are set, both apps fall back
to browser-local storage and behave exactly as they do today.

## 1. Create the project

<https://supabase.com/dashboard> → **New project**. Pick the region closest to
your learners (`ap-south-1`, Mumbai) — every query is a round trip from the
browser, so region is the single biggest lever on how fast this feels.

## 2. Run the schema

Open **SQL Editor** and run each file in `supabase/migrations/` in order:

| File | What it adds |
|---|---|
| `0001_init.sql` | `profiles`, `courses`, `sessions`, `enrolments`, the `session_occupancy` view, and the RLS policies |
| `0002_admin_access.sql` | The `viewer` role and `admin_invites`; also closes a hole in `0001` that let an account write its own `role` |
| `0003_course_media.sql` | The `course-media` storage bucket for banners, module covers and lesson images — public-read, admin-write |
| `0004_course_progress.sql` | Per-learner lesson and quiz progress, behind the Learner progress screen |
| `0005_enquiries.sql` | `enquiries` — everything the website's forms collect |
| `0006_masterclass_registrations.sql` | Paid masterclass registrations, and the enquiry rows they appear as |
| `0007_admin_courses_in_db.sql` | Moves courses and sessions out of the admin's browser and into the database |
| `0008_website_catalog.sql` | The columns the public website prints, and the column-level grants that keep the rest private |
| `0009_seed_catalog.sql` | The catalogue itself — the courses and sessions the site launched with |
| `0010_course_brochure.sql` | `courses.brochure_url`, and PDFs in the `course-media` bucket |
| `0011_course_modules.sql` | The real syllabus for the three courses that publish one — PoSH (15), POCSO (8) and DEI (13) |
| `0012_drop_demo_course.sql` | Deletes the demo course, its sessions, its test enrolments and its progress rows |
| `0013_batches.sql` | `batches` (each dated run of a course), `sessions.batch_id` with every existing session backfilled into a batch, and the private `session_links` table for Zoom links |
| `0014_enrolments_by_batch.sql` | Enrolments move onto batches with a pending / paid / cancelled status and a payment link; drops the two policies that let a learner mark their own enrolment paid; seat capacity per batch, locked against double booking |
| `0015_posh_lms_modules.sql` | PoSH's module list becomes the 13 modules the LMS content is written in, each with its lesson ids |
| `0016_enquiry_source.sql` | Lead-source columns on `enquiries` |
| `0017_learner_access.sql` | Enrolment claim codes (`LVT-XXXXXX`) and `claim_enrolment`, `batch_module_unlocks`, `my_course_access` for the LMS, `batch_seats_left`, and `record_paid_enrolment` for the payment server (service key only) |

Every file is written to be re-runnable, so running one twice is safe. Without
`0003`, image uploads fail with *"the course-media bucket is missing"*; without
`0010`, saving a course fails outright, because the form writes `brochure_url`
on every save. The admin from `0013` onwards loads batches and enrolments on
start-up, so run `0013`–`0015` **before** deploying it — the build before it
keeps working against the new schema in the meantime.

## 3. Wire the keys

**Project Settings → Data API** gives the URL. **Project Settings → API Keys**
gives the anon (publishable) key. Put them in `.env.local` in *both* projects:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Copy `.env.example` as your starting point. `.env*.local` is gitignored in both
repos.

> **Never use the `service_role` key here.** It bypasses RLS completely, and
> both apps are static exports — anything in `NEXT_PUBLIC_*` is readable by
> anyone who opens the page. The anon key is safe precisely because RLS decides
> what it can reach.

## 4. Make the first admin

The admin portal has no sign-up, and its sign-in screen takes a password and
nothing else. Access is by invitation, and only an admin can invite — so the
first account is made by hand, once.

Open `supabase/seed_admin.sql`, set the email, password and name at the top,
and run the whole file in the **SQL editor**. It creates the account and grants
it `admin` in one pass, and is safe to re-run — an address that already exists
has its password reset rather than being duplicated.

That file is **gitignored**, because it holds a real password in plaintext. If
it is missing from a fresh clone, the equivalent by hand is
**Authentication → Users → Add user** (tick *Auto Confirm User*), then:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@levitatepeoplesoft.com');
```

Either way: sign in with that address and password, change the password under
**Users → Set my password**, and **Users** is where everyone else gets invited
from. Never come back to the SQL editor for a role again.

## 5. Auth settings worth checking

- **Authentication → URL Configuration → Redirect URLs**: add the admin origin
  with a wildcard — `https://admin.example.com/**`. This is the setting that
  decides where an invite lands. Supabase only honours the app's requested
  redirect if it matches this allow-list; otherwise it falls back to **Site
  URL**, which for this project is the learner site, and an admin invite would
  drop the person on the wrong app. The wildcard matters: links point at
  `/enrolments/`, not the bare origin. Add the learner origin too, for its own
  links.
- **Authentication → Providers → Email** must be enabled. Invites are sent as
  magic links, which is a different template from the signup confirmation —
  turning *Confirm email* off does not turn invites off.
- **Authentication → Emails → Magic Link** is the template an invitee receives.
  Worth a sentence of your own wording, since for them it is an invitation
  rather than a login.
- **Rate limits**: Supabase's built-in SMTP allows only a handful of emails an
  hour. That is fine for onboarding a team of five; wire your own SMTP under
  **Project Settings → Auth → SMTP** before doing more.

## 6. Who can get in, and how

Three roles live in `profiles.role`:

| Role | Admin portal | What they can do |
|---|---|---|
| `admin` | yes | Everything, including inviting and removing other people |
| `viewer` | yes | Read every screen; every write is refused |
| `learner` | no | Nothing here — an ordinary account on the public site |

**Inviting.** An admin opens **Users → Invite someone**, enters an address and
picks a role. That writes a row to `admin_invites` and emails a link. The row is
what grants the role; the email is only how the person reaches it. Opening the
link signs them in, and a trigger attaches the invited role to their account.
Someone who already had a learner account picks their invite up on their next
sign-in instead, via `claim_admin_invite()`.

**Invitees must choose a password before the portal opens.** The invite link is
one-time and the sign-in screen offers nothing else, so arriving through a link
lands on a blocking *Choose a password* step — no way past it but setting one or
signing out. After that they sign in normally, and can change it from
**Users → Set my password**.

There is still no self-service reset for a *forgotten* password. Recovering one
means **Authentication → Users** in the dashboard: send a recovery link, or set
a password for them.

**Why an invite table rather than Supabase's own invite API.** That API needs
the `service_role` key, and this app is a static export — it has nowhere to keep
one. Doing it as a table means RLS decides who may invite, which is the check
that actually matters.

**Removing someone.** *Revoke* drops them to `learner`. Their account survives,
but every policy stops answering for them on the next request. Deleting the
account itself needs the `service_role` key, so do that from the dashboard if
you want it gone entirely.

**Roles are not self-service.** `authenticated` has no UPDATE privilege on
`profiles.role` at all — not a policy that could be worked around, an absent
privilege. Roles move only through `set_admin_role()` (which refuses anyone who
is not an admin, and refuses to let you change your own) or through accepting an
invite.

## What the policies actually enforce

| Table | Anonymous | Signed-in learner | Viewer | Admin |
|---|---|---|---|---|
| `courses` | read `live` only | read `live` only | read all | full |
| `sessions` | read non-draft on live courses | same | read all | full |
| `enrolments` | none | read/write **their own** | read all | full |
| `profiles` | none | read/update **their own** | read all | read all |
| `admin_invites` | none | none | read | full |

A viewer's read-only-ness is a property of the database, not of the buttons the
UI happens to render. Every write policy is `is_admin()`; the hidden buttons are
only there so a viewer is not invited to try.

Two rules are enforced in the database rather than the UI, because a browser
check is only a suggestion:

- **`paid` is not learner-writable.** Payment state is set by an admin or a
  verified webhook. A learner cannot mark themselves paid by calling the API
  directly.
- **Capacity is a trigger.** `check_seat_capacity` refuses an insert that would
  push a session past its seat count, so two admins enrolling simultaneously
  cannot oversell it.

## Still needed after this

Connecting the database does **not** by itself secure paid content. Lesson
media URLs would still ship in the JS bundle. Gating real video and PDFs needs
signed URLs issued server-side — a Supabase Edge Function, or the existing PHP
endpoint on SiteGround.
