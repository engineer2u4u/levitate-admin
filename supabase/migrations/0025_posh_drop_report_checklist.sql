-- Levitate LMS — drop the retired "Inquiry Report Structure" item from PoSH
--
-- The item is `p-report-checklist`, a reading inside "Complaint Intake and
-- Fair Inquiry". It is being taken out of the course, so it has to come out of
-- the required list too.
--
-- The same trap as 0021, and worth restating because it will come round again:
-- `issue_certificate` requires every id in `courses.modules[].itemIds` to
-- appear in the learner's `completed_items`. An id that no longer exists in
-- the course can never be completed, so leaving it listed would silently stop
-- every PoSH certificate from issuing. Whenever an item leaves the content,
-- this is the other half of the change.
--
-- Safe to run before or after the website is deployed: a listed item nobody
-- can reach blocks certificates, an unlisted item that still renders is merely
-- optional reading.
--
-- Scoped to PoSH by slug, and re-runnable.

do $$
declare
  v_item    text := 'p-report-checklist';
  v_slug    text := 'posh-trainer';
  v_modules jsonb;
  v_before  integer;
  v_after   integer;
begin
  select count(*)::integer into v_before
    from public.courses c,
         jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) m,
         jsonb_array_elements_text(coalesce(m -> 'itemIds', '[]'::jsonb)) i
   where c.slug = v_slug;

  -- Rebuild the modules in order, each without the retired id. A module left
  -- with nothing at all is dropped; this one keeps its other reading, so it
  -- stays.
  select coalesce(jsonb_agg(m order by ord), '[]'::jsonb)
    into v_modules
    from (
      select ord,
             case
               when m ? 'itemIds' then
                 jsonb_set(m, '{itemIds}', coalesce((
                   select jsonb_agg(v order by n)
                     from jsonb_array_elements_text(m -> 'itemIds') with ordinality as t(v, n)
                    where v <> v_item
                 ), '[]'::jsonb))
               else m
             end as m
        from public.courses c,
             jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) with ordinality as s(m, ord)
       where c.slug = v_slug
    ) rebuilt
   where not (m ? 'itemIds' and jsonb_array_length(m -> 'itemIds') = 0);

  update public.courses set modules = v_modules where slug = v_slug;

  -- Nobody keeps credit for an item that is no longer part of the course.
  update public.course_progress
     set completed_items = array_remove(completed_items, v_item)
   where course_slug = v_slug
     and v_item = any(completed_items);

  select count(*)::integer into v_after
    from public.courses c,
         jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) m,
         jsonb_array_elements_text(coalesce(m -> 'itemIds', '[]'::jsonb)) i
   where c.slug = v_slug;

  raise notice 'PoSH required items: % before, % after.', v_before, v_after;
end;
$$;

-- What PoSH now requires.
select m ->> 'title' as module, m -> 'itemIds' as item_ids
  from public.courses c,
       jsonb_array_elements(c.modules) as m
 where c.slug = 'posh-trainer';
