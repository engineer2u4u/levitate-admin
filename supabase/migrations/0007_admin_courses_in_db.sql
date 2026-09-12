-- Courses and sessions move out of the admin's browser storage.
--
-- Until now the Courses and Sessions screens saved to localStorage: a course
-- edited on one laptop existed nowhere else, and the public website could
-- never see it. They now read and write these tables, which is also what the
-- website reads — so the admin's catalogue becomes the site's catalogue.
--
-- 0001 created both tables with only the fields the first catalogue needed.
-- These are the rest of what the admin's course form edits. Everything is
-- additive with a default, so existing rows and the policies in 0001/0002
-- (public read of live courses, admin-only writes) are unchanged.
--
-- Re-runnable, like the migrations before it.

alter table public.courses
  -- Calendar span, e.g. "6 weeks". `duration` stays the teaching time.
  add column if not exists tenure                text    not null default '',
  -- Points at a facilitator record, which still lives in the admin's own
  -- storage. A plain id rather than a foreign key for that reason.
  add column if not exists facilitator_id        text    not null default '',
  add column if not exists live_session_count    integer not null default 0 check (live_session_count >= 0),
  -- "Saturdays, 10:00–13:00 IST". Scheduled dates live in sessions.
  add column if not exists live_session_schedule text    not null default '',
  -- In the course-media bucket (0003).
  add column if not exists banner_url            text    not null default '',
  -- The module and lesson tree, edited as one document by the course form.
  add column if not exists modules               jsonb   not null default '[]'::jsonb;

-- updated_at existed from 0001 but nothing kept it current.
create or replace function public.stamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists courses_stamp_updated on public.courses;
create trigger courses_stamp_updated
  before update on public.courses
  for each row execute function public.stamp_updated_at();
