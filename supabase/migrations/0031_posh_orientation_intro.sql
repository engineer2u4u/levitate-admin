-- Levitate LMS — add the programme overview film to PoSH Orientation
--
-- A five-minute film introducing the programme, placed first in Orientation
-- and Pre-read, before the agreement and the two readings. It is the first
-- thing a delegate meets.
--
-- The item is `p-orientation-intro` (YouTube 7Y8FVmsAsz0) and it lives in the
-- website's `poshContent.ts`. This is the other half of that change: the
-- `itemIds` the database lists are what progress counts out of and what
-- `issue_certificate` insists on, so a new item that is not listed here is
-- optional reading that nobody's percentage notices.
--
-- Ordering, unlike 0021/0025/0029: deploy the website FIRST. A listed id that
-- the content does not render can never be completed, which would stall every
-- PoSH certificate. An unlisted id that renders is merely uncounted. So this
-- migration follows the deploy; the reverse order is the one that hurts.
--
-- Scoped to PoSH by slug, and re-runnable — a second run finds the id already
-- there and changes nothing.

do $$
declare
  v_item    text := 'p-orientation-intro';
  v_module  text := 'orientation';
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

  -- Rebuild the modules in order. Orientation gains the film at the front,
  -- which is where the content puts it; everything else is untouched.
  select coalesce(jsonb_agg(m order by ord), '[]'::jsonb)
    into v_modules
    from (
      select ord,
             case
               when m ->> 'id' = v_module
                    and not (coalesce(m -> 'itemIds', '[]'::jsonb) ? v_item) then
                 jsonb_set(
                   m,
                   '{itemIds}',
                   to_jsonb(array[v_item]) || coalesce(m -> 'itemIds', '[]'::jsonb)
                 )
               else m
             end as m
        from public.courses c,
             jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) with ordinality as s(m, ord)
       where c.slug = v_slug
    ) rebuilt;

  update public.courses set modules = v_modules where slug = v_slug;

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
