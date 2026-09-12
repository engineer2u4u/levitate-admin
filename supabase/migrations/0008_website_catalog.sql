-- The public website's catalogue, held in the tables the admin edits.
--
-- The website used to hard-code every course fact — fees, dates, titles,
-- modes — in its own source, so an admin could change nothing a visitor saw.
-- It now reads these columns: once when it is built (so the HTML Google sees
-- is current) and again in the browser as a page loads (so a saved change
-- shows within seconds, without a deploy).
--
-- Two status fields, deliberately separate:
--   status       draft / live / archived — whether the course is published
--                at all (0001). Only live rows are public.
--   site_status  enrolling / waitlist — what a published course offers.
--
-- Dates live on sessions. A course's "batch starts" is its first open
-- session; starts_label covers a course with no dates yet ("October 2026").
--
-- Re-runnable, like the migrations before it.

-- ------------------------------------------------------------------ courses

alter table public.courses
  -- "PoSH Train-the-Trainer": the name used in the nav, cards and bars.
  add column if not exists short            text    not null default '',
  -- The small label on a catalogue card.
  add column if not exists tag              text    not null default '',
  -- "Live online · Weekend batch". May contain {starts}.
  add column if not exists mode             text    not null default '',
  add column if not exists site_status      text    not null default 'waitlist'
                                            check (site_status in ('enrolling', 'waitlist')),
  -- Published and readable (a checkout or a landing page may need it) but
  -- kept out of the nav, the catalogue and the sitemap. The masterclass is one.
  add column if not exists hidden           boolean not null default false,
  -- True where the fee is not yet set: the site shows "On request" and the
  -- payment server refuses to take money for it.
  add column if not exists price_on_request boolean not null default false,
  -- "incl. taxes · from {starts_short}". May contain placeholders.
  add column if not exists price_note       text    not null default '',
  -- The struck-through "standard fee" beside a discounted one. Never charged.
  add column if not exists list_price_paise integer check (list_price_paise is null or list_price_paise >= 0),
  add column if not exists modules_label    text    not null default '',
  add column if not exists hours_label      text    not null default '',
  -- The name as printed on the site. The admin's facilitator records live in
  -- its own storage, so the name is copied here when the course is saved.
  add column if not exists facilitator_name text    not null default '',
  -- Card image: a path on the site ("/assets/…") or a course-media URL.
  add column if not exists image            text    not null default '',
  add column if not exists sort_order       integer not null default 0,
  -- Shown as the start while a course has no open session: "October 2026".
  add column if not exists starts_label     text    not null default '',
  -- The Upcoming Batches card: { show, tag, title, short, status_label,
  -- rows: [{k, v}], fee_note, cta }. Row values may contain placeholders.
  add column if not exists batch            jsonb   not null default '{}'::jsonb;

create index if not exists courses_sort_idx on public.courses (sort_order, title);

-- ----------------------------------------------------------------- sessions

alter table public.sessions
  -- What the session covers: "Foundations & the CLEAR framework".
  add column if not exists topic     text        not null default '',
  -- The exact start and end, where the minute matters. The masterclass stops
  -- taking payment at starts_at.
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at   timestamptz;

-- Dropped first so the file stays re-runnable.
alter table public.sessions drop constraint if exists sessions_ends_after_starts;
alter table public.sessions
  add constraint sessions_ends_after_starts
  check (ends_at is null or starts_at is null or ends_at > starts_at);

-- ------------------------------------------------------------------- grants

-- Row policies (0002) already limit the public to live courses. Columns are
-- limited here: the anonymous role reads what the website shows and nothing
-- else — not the admin's module and lesson tree, and not any column added
-- later until someone decides it is public.
revoke select on public.courses from anon;
grant select (
  id, slug, title, category, description, duration, price_paise, status,
  short, tag, mode, site_status, hidden, price_on_request, price_note,
  list_price_paise, modules_label, hours_label, facilitator_name, image,
  sort_order, starts_label, batch, tenure, updated_at
) on public.courses to anon;
