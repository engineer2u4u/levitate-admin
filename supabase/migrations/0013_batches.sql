-- Batches: each dated run of a course.
--
-- A certification runs again and again through the year — an October batch,
-- then a November one with new dates. Until now a session hung straight off
-- its course, so the second run's dates had nowhere to go but beside the
-- first's, and nothing recorded that October had finished. A batch is that
-- run: its own dates, its own seats, its own learners, and a status that
-- keeps completed runs as history instead of deleting them.
--
-- Also adds `session_links` for Zoom links. They are not a column on
-- `sessions` because the public website reads that table with the anon key,
-- and nothing narrows which of its columns anon can see: a join link there
-- would be on the open internet.
--
-- Re-runnable, like the migrations before it.

-- ----------------------------------------------------------------- batches

create table if not exists public.batches (
  id             uuid primary key default gen_random_uuid(),
  -- restrict: a course with batches is archived, never deleted, so the
  -- history of who took which run survives.
  course_id      uuid not null references public.courses on delete restrict,
  -- "October 2026" — what the office and the learners call it.
  name           text not null check (length(trim(name)) between 1 and 120),
  -- "2026-10", unique within a course when set. Blank for batches made by the
  -- compatibility trigger below.
  code           text not null default '',
  starts_on      date,
  ends_on        date,
  -- upcoming → running → completed. Cancelled for a run that never happened.
  -- Set by an admin; nothing moves it on a timer.
  status         text not null default 'upcoming'
                 check (status in ('upcoming', 'running', 'completed', 'cancelled')),
  -- Whether it is taking new enrolments. Separate from status, so a running
  -- batch can still take a late joiner and an upcoming one can be closed.
  enrolment_open boolean not null default true,
  seats          integer not null default 30 check (seats > 0),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint batches_ends_after_starts check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists batches_course_code on public.batches (course_id, code) where code <> '';
create index if not exists batches_course_idx on public.batches (course_id, starts_on);

drop trigger if exists batches_stamp_updated on public.batches;
create trigger batches_stamp_updated
  before update on public.batches
  for each row execute function public.stamp_updated_at();

-- Completing or cancelling a batch stamps it, and closes its sessions. The
-- website lists only open sessions, so the moment October is marked complete
-- the site moves on to November's dates without a deploy.
create or replace function public.batch_status_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('completed', 'cancelled') then
    new.completed_at := coalesce(new.completed_at, now());
  else
    -- Reopened: it is not finished any more.
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists batches_status_stamp on public.batches;
create trigger batches_status_stamp
  before insert or update of status on public.batches
  for each row execute function public.batch_status_stamp();

create or replace function public.batch_status_close_sessions()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('completed', 'cancelled') and old.status is distinct from new.status then
    update public.sessions set status = 'closed'
     where batch_id = new.id and status <> 'closed';
  end if;
  return new;
end;
$$;

drop trigger if exists batches_close_sessions on public.batches;
create trigger batches_close_sessions
  after update of status on public.batches
  for each row execute function public.batch_status_close_sessions();

-- ----------------------------------------------------------- sessions.batch

alter table public.sessions
  add column if not exists batch_id uuid references public.batches on delete cascade;

create index if not exists sessions_batch_idx on public.sessions (batch_id, starts_on);

-- Every course that already has sessions gets one batch holding them, named
-- for the month its first session falls in. A course that already has a
-- batch is left alone, so running this twice makes nothing twice.
insert into public.batches (course_id, name, code, starts_on, ends_on, seats, enrolment_open)
select
  s.course_id,
  coalesce(to_char(min(s.starts_on), 'FMMonth YYYY'), 'First batch'),
  coalesce(to_char(min(s.starts_on), 'YYYY-MM'), ''),
  min(s.starts_on),
  max(s.starts_on),
  greatest(coalesce(max(s.seats), 30), 1),
  bool_or(c.site_status = 'enrolling')
from public.sessions s
join public.courses c on c.id = s.course_id
where s.batch_id is null
  and not exists (select 1 from public.batches b where b.course_id = s.course_id)
group by s.course_id;

-- Unbatched sessions join their course's earliest batch that is still going.
update public.sessions s
   set batch_id = (
     select b.id
       from public.batches b
      where b.course_id = s.course_id
      order by (b.status in ('completed', 'cancelled')), b.starts_on nulls last, b.created_at
      limit 1
   )
 where s.batch_id is null;

-- A session always belongs to a batch of its own course.
--
-- The fallback keeps the admin build that predates batches working between
-- this migration and its deploy: it inserts sessions with no batch, and they
-- land in the course's next batch — one is made if there is none.
create or replace function public.sessions_batch_guard()
returns trigger
language plpgsql
as $$
begin
  if new.batch_id is null then
    select b.id into new.batch_id
      from public.batches b
     where b.course_id = new.course_id and b.status in ('upcoming', 'running')
     order by b.starts_on nulls last, b.created_at
     limit 1;

    if new.batch_id is null then
      insert into public.batches (course_id, name, starts_on, seats)
      values (new.course_id, coalesce(to_char(new.starts_on, 'FMMonth YYYY'), 'New batch'), new.starts_on, new.seats)
      returning id into new.batch_id;
    end if;
  end if;

  if not exists (select 1 from public.batches b where b.id = new.batch_id and b.course_id = new.course_id) then
    raise exception 'That batch belongs to a different course.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_batch_guard on public.sessions;
create trigger sessions_batch_guard
  before insert or update of batch_id, course_id on public.sessions
  for each row execute function public.sessions_batch_guard();

-- Safe now: every existing row was backfilled above, and the trigger fills a
-- new one before the constraint is checked.
alter table public.sessions alter column batch_id set not null;

-- ------------------------------------------------------------ session links

create table if not exists public.session_links (
  session_id    uuid primary key references public.sessions on delete cascade,
  join_url      text not null default '' check (join_url = '' or join_url ~* '^https://'),
  meeting_id    text not null default '',
  passcode      text not null default '',
  -- Shared after the session, for anyone who missed it.
  recording_url text not null default '' check (recording_url = '' or recording_url ~* '^https://'),
  updated_at    timestamptz not null default now()
);

drop trigger if exists session_links_stamp_updated on public.session_links;
create trigger session_links_stamp_updated
  before update on public.session_links
  for each row execute function public.stamp_updated_at();

-- --------------------------------------------------------------------- RLS

alter table public.batches enable row level security;
alter table public.session_links enable row level security;

-- Batches are harmless to show: the website will list the next ones. Staff
-- see every batch, completed and cancelled included.
drop policy if exists batches_read on public.batches;
create policy batches_read on public.batches
  for select using (
    public.is_staff()
    or (status in ('upcoming', 'running') and exists (
      select 1 from public.courses c where c.id = course_id and c.status = 'live'
    ))
  );

drop policy if exists batches_admin_write on public.batches;
create policy batches_admin_write on public.batches
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.batches to anon, authenticated;
grant insert, update, delete on public.batches to authenticated;

-- Join links: never anon. Staff read them here; paid learners get theirs
-- through a function in a later migration, not by reading this table.
revoke all on public.session_links from anon;
grant select, insert, update, delete on public.session_links to authenticated;

drop policy if exists session_links_staff_read on public.session_links;
create policy session_links_staff_read on public.session_links
  for select using (public.is_staff());

drop policy if exists session_links_admin_write on public.session_links;
create policy session_links_admin_write on public.session_links
  for all using (public.is_admin()) with check (public.is_admin());
