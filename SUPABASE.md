# Connecting to Supabase

One Supabase project sits behind both apps: the admin writes the catalogue, the
learner site reads it. Until the two values below are set, both apps fall back
to browser-local storage and behave exactly as they do today.

## 1. Create the project

<https://supabase.com/dashboard> → **New project**. Pick the region closest to
your learners (`ap-south-1`, Mumbai) — every query is a round trip from the
browser, so region is the single biggest lever on how fast this feels.

## 2. Run the schema

Open **SQL Editor** → paste `supabase/migrations/0001_init.sql` → **Run**.

That creates `profiles`, `courses`, `sessions`, `enrolments`, the
`session_occupancy` view, and the Row Level Security policies. It is written to
be re-runnable, so running it twice is safe.

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

## 4. Make yourself an admin

Roles are not self-service — otherwise anyone signing up could grant themselves
the catalogue. Sign up through the admin app, then run once in the SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@levitatepeoplesoft.com');
```

## 5. Auth settings worth checking

- **Authentication → Providers → Email**: with *Confirm email* on, sign-up
  returns no session until the link is clicked. Both apps already handle this
  and tell the user to check their inbox rather than dropping them on a
  signed-out screen.
- **Authentication → URL Configuration**: add the site and admin origins to
  *Redirect URLs*, or confirmation links bounce.

## What the policies actually enforce

| Table | Anonymous | Signed-in learner | Admin |
|---|---|---|---|
| `courses` | read `live` only | read `live` only | full |
| `sessions` | read non-draft on live courses | same | full |
| `enrolments` | none | read/write **their own** | full |
| `profiles` | none | read/update **their own** | read all |

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
