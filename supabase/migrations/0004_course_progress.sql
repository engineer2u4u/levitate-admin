-- Self-paced course progress.
--
-- Separate from `enrolments` on purpose. An enrolment is a commercial record:
-- it points at a scheduled session, carries a price and a paid flag, and one
-- exists per seat sold. Progress through course content is a different thing —
-- it is per learner per course, it has no session, and it exists whether or not
-- a seat was ever sold. Folding it into enrolments would have forced a
-- session_id onto every self-paced learner and made "has this person finished
-- the course" a question about a row that means something else.
--
-- The learner site writes here; the admin reads it to see each person's
-- journey. Both go through RLS with the anon key — there is no service role in
-- either app, because both are static builds and anything they hold is public.

create table if not exists public.course_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  -- The learner site addresses courses by slug, not by the courses.id UUID, and
  -- self-paced content exists before a course row is ever created in the admin.
  -- Text keeps the two able to move independently.
  course_slug  text not null,

  -- Item ids the learner has finished, in the order they finished them. Order
  -- is worth keeping: it is the journey, not just the total.
  completed_items text[] not null default '{}',

  -- Best attempt per quiz item: { "<item id>": { "score": 7, "total": 10 } }.
  -- Attempting a quiz completes it, so a low score never blocks the next item —
  -- the score is recorded for the admin to see, not to gate on.
  quiz_attempts jsonb not null default '{}'::jsonb,

  started_at   timestamptz not null default now(),
  -- Set once every item is done. Also what releases the reading kit.
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),

  -- One progress row per learner per course. The learner site upserts on this.
  unique (user_id, course_slug)
);

create index if not exists course_progress_user_idx on public.course_progress (user_id);
create index if not exists course_progress_course_idx on public.course_progress (course_slug);

-- `updated_at` is what the admin sorts "recently active" by, so it must not
-- depend on the client remembering to send it.
create or replace function public.touch_course_progress()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists course_progress_touch on public.course_progress;
create trigger course_progress_touch
  before update on public.course_progress
  for each row execute function public.touch_course_progress();

-- ------------------------------------------------------------------- RLS

alter table public.course_progress enable row level security;

-- A learner sees and writes only their own row. An admin sees every row but
-- does not write them: progress is earned in the learner app, and an admin
-- editing it would make the record untrustworthy as evidence of completion.
drop policy if exists course_progress_own_read on public.course_progress;
create policy course_progress_own_read on public.course_progress
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists course_progress_own_insert on public.course_progress;
create policy course_progress_own_insert on public.course_progress
  for insert with check (user_id = auth.uid());

drop policy if exists course_progress_own_update on public.course_progress;
create policy course_progress_own_update on public.course_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------- admin's read join
--
-- The admin needs a name against each row. Reading profiles directly for this
-- would need a policy letting admins read every profile; a view keeps the join
-- in one place and returns exactly the columns the screen shows.

create or replace view public.course_progress_admin as
  select
    cp.id,
    cp.user_id,
    cp.course_slug,
    cp.completed_items,
    cp.quiz_attempts,
    cp.started_at,
    cp.completed_at,
    cp.updated_at,
    coalesce(p.name, '') as learner_name,
    coalesce(p.org, '')  as learner_org
  from public.course_progress cp
  left join public.profiles p on p.id = cp.user_id;

grant select on public.course_progress_admin to authenticated;

-- Admins read every profile, which is what the view above joins to. Without
-- this the join returns blank names for everyone but the admin themselves.
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());
