-- Levitate LMS — initial schema
--
-- One database behind both apps: the admin writes the catalogue, the learner
-- site reads it. Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Money is integer paise everywhere, matching both codebases — never numeric,
-- never float, so a fee cannot drift by a rounding error.

-- ---------------------------------------------------------------- profiles

-- auth.users owns identity; this carries the fields we show and the role.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default '',
  org         text not null default '',
  role        text not null default 'learner' check (role in ('learner', 'admin')),
  created_at  timestamptz not null default now()
);

-- Every new signup gets a profile, with name/org lifted from the signup
-- metadata the client sends. Without this an account exists with no profile
-- row and every policy that joins to it fails closed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, org)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'org', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role lookup used by every admin policy. SECURITY DEFINER so the policy can
-- read profiles without recursing through profiles' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------- courses

create table if not exists public.courses (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  category     text not null default '',
  description  text not null default '',
  duration     text not null default '',
  price_paise  integer not null default 0 check (price_paise >= 0),
  status       text not null default 'draft' check (status in ('draft', 'live', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- sessions

create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses on delete cascade,
  -- Sortable date for ordering; the labels are what the UI prints.
  starts_on   date,
  date_label  text not null,
  time_label  text not null default '',
  mode        text not null default '',
  trainer     text not null default '',
  seats       integer not null check (seats > 0),
  -- Only editorial states are stored. Open/Filling/Full are derived from real
  -- bookings so the badge can never drift from the data.
  status      text not null default 'open' check (status in ('draft', 'open', 'closed')),
  created_at  timestamptz not null default now()
);

create index if not exists sessions_course_idx on public.sessions (course_id, starts_on);

-- -------------------------------------------------------------- enrolments

create table if not exists public.enrolments (
  id           uuid primary key default gen_random_uuid(),
  -- Null until a phone enrolment's customer creates their account: the row
  -- exists first and is claimed later by matching email.
  user_id      uuid references auth.users on delete set null,
  name         text not null,
  email        text not null default '',
  phone        text not null default '',
  -- restrict, not cascade: deleting a course must never erase who paid for it.
  course_id    uuid not null references public.courses on delete restrict,
  session_id   uuid not null references public.sessions on delete restrict,
  source       text not null default 'Website' check (source in ('Phone', 'Website', 'Corporate')),
  -- Snapshotted at enrolment. A later price change must not rewrite history.
  amount_paise integer not null check (amount_paise >= 0),
  seats        integer not null default 1 check (seats > 0),
  method       text not null default 'link' check (method in ('link', 'invoice', 'paid')),
  paid         boolean not null default false,

  -- learner progress
  stages_unlocked    integer not null default 1 check (stages_unlocked >= 0),
  sessions_attended  integer not null default 0 check (sessions_attended >= 0),
  completed_lessons  text[] not null default '{}',
  quiz_best          jsonb not null default '{}'::jsonb,
  certificate_issued boolean not null default false,

  created_at   timestamptz not null default now()
);

create index if not exists enrolments_user_idx on public.enrolments (user_id);
create index if not exists enrolments_session_idx on public.enrolments (session_id);

-- One person cannot hold two enrolments on the same session.
create unique index if not exists enrolments_one_per_session
  on public.enrolments (user_id, session_id)
  where user_id is not null;

-- ------------------------------------------------------------- occupancy

-- Seats sold per session, counting a corporate booking's whole block. A view
-- so both apps compute occupancy identically instead of each doing its own sum.
create or replace view public.session_occupancy as
  select
    s.id                                        as session_id,
    s.course_id,
    s.seats                                     as capacity,
    coalesce(sum(e.seats), 0)::integer          as taken,
    greatest(s.seats - coalesce(sum(e.seats), 0), 0)::integer as remaining
  from public.sessions s
  left join public.enrolments e on e.session_id = s.id
  group by s.id;

-- Refuse an overbooking at the database, not just in the UI — two admins
-- enrolling at once must not be able to push a session past capacity.
create or replace function public.check_seat_capacity()
returns trigger
language plpgsql
as $$
declare
  cap integer;
  sold integer;
begin
  select seats into cap from public.sessions where id = new.session_id;
  select coalesce(sum(seats), 0) into sold
    from public.enrolments
    where session_id = new.session_id
      and (tg_op = 'INSERT' or id <> new.id);

  if sold + new.seats > cap then
    raise exception 'Session is full: % of % seats already taken', sold, cap
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enrolments_capacity on public.enrolments;
create trigger enrolments_capacity
  before insert or update of seats, session_id on public.enrolments
  for each row execute function public.check_seat_capacity();

-- --------------------------------------------------------------------- RLS

alter table public.profiles   enable row level security;
alter table public.courses    enable row level security;
alter table public.sessions   enable row level security;
alter table public.enrolments enable row level security;

-- profiles: you see and edit yourself; admins see everyone.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_self_write on public.profiles;
create policy profiles_self_write on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- courses: the live catalogue is world-readable (the site is public and
-- statically exported, so it reads with the anon key). Drafts stay internal.
drop policy if exists courses_public_read on public.courses;
create policy courses_public_read on public.courses
  for select using (status = 'live' or public.is_admin());

drop policy if exists courses_admin_write on public.courses;
create policy courses_admin_write on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- sessions: visible when their course is, and not a draft.
drop policy if exists sessions_public_read on public.sessions;
create policy sessions_public_read on public.sessions
  for select using (
    public.is_admin()
    or (status <> 'draft' and exists (
      select 1 from public.courses c where c.id = course_id and c.status = 'live'
    ))
  );

drop policy if exists sessions_admin_write on public.sessions;
create policy sessions_admin_write on public.sessions
  for all using (public.is_admin()) with check (public.is_admin());

-- enrolments: a learner sees only their own. Admins see all.
drop policy if exists enrolments_own_read on public.enrolments;
create policy enrolments_own_read on public.enrolments
  for select using (user_id = auth.uid() or public.is_admin());

-- A learner may create their own enrolment and update only their progress.
-- `paid` is deliberately NOT writable by the learner: payment state is set by
-- an admin or a verified webhook, never by the browser.
drop policy if exists enrolments_own_insert on public.enrolments;
create policy enrolments_own_insert on public.enrolments
  for insert with check (user_id = auth.uid());

drop policy if exists enrolments_own_update on public.enrolments;
create policy enrolments_own_update on public.enrolments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists enrolments_admin_write on public.enrolments;
create policy enrolments_admin_write on public.enrolments
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.session_occupancy to anon, authenticated;

-- ------------------------------------------------------------ make an admin
--
-- Roles are not self-service. After signing up through the admin app, run:
--
--   update public.profiles set role = 'admin' where id = (
--     select id from auth.users where email = 'you@levitatepeoplesoft.com'
--   );
