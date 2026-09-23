-- Levitate LMS — drop the retired `p-certificate` item from PoSH
--
-- The website no longer has this item: certificates are shown on the reading
-- kit page that follows the last item, and the course now ends at `p-feedback`.
--
-- This is not tidying. `issue_certificate` (0020) requires every id in
-- `courses.modules[].itemIds` to appear in the learner's `completed_items`, so
-- an id that no longer exists in the course can never be completed, and no
-- certificate could ever issue for PoSH while this row still listed it. The
-- check is right; the list was stale.
--
-- Three things go, in one pass:
--   1. the id, from the module that holds it;
--   2. the module itself, now that it holds nothing — "Your Certificate" was
--      that one item and nothing else;
--   3. the id from anyone's completed_items, so a learner is not credited with
--      an item that no longer exists.
--
-- Scoped to PoSH by slug, and re-runnable: running it twice changes nothing
-- the second time.

do $$
declare
  v_item     text := 'p-certificate';
  v_slug     text := 'posh-trainer';
  v_modules  jsonb;
  v_before   integer;
  v_after    integer;
begin
  select jsonb_array_length(modules) into v_before
    from public.courses where slug = v_slug;

  if v_before is null then
    raise notice 'No course %, nothing to do.', v_slug;
    return;
  end if;

  -- Rebuild the array in order: each module keeps everything it had, minus the
  -- retired id, and a module left with no items at all is dropped.
  select coalesce(jsonb_agg(m order by ord), '[]'::jsonb)
    into v_modules
    from (
      select ord,
             case
               when m ? 'itemIds' then
                 jsonb_set(
                   m,
                   '{itemIds}',
                   coalesce((
                     select jsonb_agg(v order by n)
                       from jsonb_array_elements_text(m -> 'itemIds') with ordinality as t(v, n)
                      where v <> v_item
                   ), '[]'::jsonb)
                 )
               else m
             end as m
        from public.courses c,
             jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) with ordinality as s(m, ord)
       where c.slug = v_slug
    ) rebuilt
   -- A module that never carried item ids is left alone; one that carried some
   -- and now carries none has nothing left to teach.
   where not (m ? 'itemIds' and jsonb_array_length(m -> 'itemIds') = 0);

  update public.courses set modules = v_modules where slug = v_slug;

  select jsonb_array_length(modules) into v_after
    from public.courses where slug = v_slug;

  raise notice 'PoSH modules: % before, % after.', v_before, v_after;

  -- And nobody keeps credit for an item that no longer exists.
  update public.course_progress
     set completed_items = array_remove(completed_items, v_item)
   where course_slug = v_slug
     and v_item = any(completed_items);
end;
$$;

-- What PoSH now requires, and what each learner has done against it.
select m ->> 'title' as module, m -> 'itemIds' as item_ids
  from public.courses c,
       jsonb_array_elements(c.modules) as m
 where c.slug = 'posh-trainer';

select cp.course_slug,
       cardinality(cp.completed_items) as items_done,
       cp.completed_at
  from public.course_progress cp
 where cp.course_slug = 'posh-trainer';
