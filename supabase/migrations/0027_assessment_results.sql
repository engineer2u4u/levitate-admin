-- Levitate LMS — keep the final assessment's score
--
-- 0019 threw quiz marks away, and rightly: a stage check is passed or not, and
-- a half-remembered 2/3 against someone's name told nobody anything. The final
-- assessment is a different thing. It is the formal one, it is what a
-- certificate stands on, and "what did they actually score" is a question that
-- gets asked months later — by an employer, by an IC, by the office checking
-- its own record. That answer has to exist.
--
-- So this is deliberately narrow: assessment attempts, not quiz marks. Every
-- attempt is kept rather than only the best, because a record that silently
-- replaces itself cannot answer "how many goes did this take".
--
-- Re-runnable. Run in the Supabase SQL editor.

create table if not exists public.assessment_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  course_slug text not null,
  -- The item the assessment is, e.g. p-final-assessment. Not constrained to
  -- one id: another course's assessment is the same kind of record.
  item_id     text not null,
  score       integer not null check (score >= 0),
  total       integer not null check (total > 0),
  passed      boolean not null,
  attempted_at timestamptz not null default now(),
  constraint assessment_results_score_within_total check (score <= total)
);

create index if not exists assessment_results_user_idx
  on public.assessment_results (user_id, course_slug, attempted_at desc);

alter table public.assessment_results enable row level security;
revoke all on public.assessment_results from anon;
grant select on public.assessment_results to authenticated;

-- A learner sees their own; staff see everyone's. Nobody writes directly —
-- the function below is the only way in, so a row cannot arrive for someone
-- else or for a course the writer never bought.
drop policy if exists assessment_results_read on public.assessment_results;
create policy assessment_results_read on public.assessment_results
  for select using (user_id = auth.uid() or public.is_staff());

/**
 * Records one attempt at a course's assessment.
 *
 * What it checks: that the caller is signed in, that the score is a sane
 * fraction of the total, and that they hold a paid enrolment on the course.
 * What it cannot check is the score itself — the quiz is marked in the
 * browser, so a determined learner could post any number. That is true of
 * completion today as well, and the honest answer is that this records what
 * was submitted rather than proving it. Worth knowing before anyone treats a
 * stored score as evidence against the learner's interest.
 */
create or replace function public.record_assessment(
  p_course_slug text,
  p_item_id     text,
  p_score       integer,
  p_total       integer,
  p_passed      boolean
)
returns public.assessment_results
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.assessment_results;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_total is null or p_total < 1 or p_score is null or p_score < 0 or p_score > p_total then
    raise exception 'That is not a score out of a total.' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
      from public.enrolments e
      join public.courses c on c.id = e.course_id
     where e.user_id = v_uid and c.slug = p_course_slug and e.status = 'paid'
  ) then
    raise exception 'No paid enrolment for this course.' using errcode = '42501';
  end if;

  insert into public.assessment_results (user_id, course_slug, item_id, score, total, passed)
  values (v_uid, p_course_slug, p_item_id, p_score, p_total, coalesce(p_passed, false))
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_assessment(text, text, integer, integer, boolean) from public, anon;
grant execute on function public.record_assessment(text, text, integer, integer, boolean) to authenticated;

-- A learner's best and latest attempt at each assessment, which is what the
-- admin shows. A view rather than a query repeated in two screens.
create or replace view public.assessment_results_admin as
  select r.user_id,
         r.course_slug,
         r.item_id,
         count(*)                                   as attempts,
         max(r.score)                               as best_score,
         max(r.total)                               as total,
         bool_or(r.passed)                          as ever_passed,
         max(r.attempted_at)                        as last_attempt_at,
         (array_agg(r.score order by r.attempted_at desc))[1] as latest_score
    from public.assessment_results r
   group by r.user_id, r.course_slug, r.item_id;

alter view public.assessment_results_admin set (security_invoker = on);
grant select on public.assessment_results_admin to authenticated;

notify pgrst, 'reload schema';
