-- Levitate LMS — stop keeping quiz marks
--
-- A quiz is passed or it is not. Passing completes the item, which is already
-- recorded in `completed_items`; failing leaves the item open and is recorded
-- nowhere. Coming back to a course shows no previous score, because there is
-- none to show.
--
-- So `quiz_attempts` goes, and the marks already in it go with it. Keeping a
-- column nobody writes would leave old scores sitting in the database against
-- people's names, which is the thing being removed, not a harmless remnant.
--
-- ORDER MATTERS. Run this only AFTER deploying the website build that stops
-- writing the column. PostgREST rejects a write naming a column that does not
-- exist, and the learner's progress is saved in one write — so dropping this
-- while the old build is live would stop progress saving altogether, not just
-- stop the marks. If in doubt, deploy first and run this second.
--
-- Re-runnable, and safe to run twice.

-- The view is dropped first: a view depending on the column would otherwise
-- make the drop fail, and `create or replace view` cannot remove a column.
drop view if exists public.course_progress_admin;

alter table public.course_progress drop column if exists quiz_attempts;

-- Rebuilt without it, otherwise identical to 0004.
create or replace view public.course_progress_admin as
  select
    cp.id,
    cp.user_id,
    cp.course_slug,
    cp.completed_items,
    cp.started_at,
    cp.completed_at,
    cp.updated_at,
    coalesce(p.name, '') as learner_name,
    coalesce(p.org, '')  as learner_org
  from public.course_progress cp
  left join public.profiles p on p.id = cp.user_id;

-- Recreating a view resets both of these, so neither is optional.
--
-- security_invoker is what keeps the view honest: without it the view runs as
-- its owner, who is exempt from row level security, and any authenticated
-- learner could read every other learner's progress and name through it.
alter view public.course_progress_admin set (security_invoker = on);
grant select on public.course_progress_admin to authenticated;

notify pgrst, 'reload schema';
