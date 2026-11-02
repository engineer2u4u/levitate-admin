-- Levitate LMS — bring the Facilitator Toolkit back to PoSH, with real content
--
-- 0029 dropped this module, and said why: it held one reading that announced
-- the materials were being assembled. They now exist — a 42MB archive of the
-- Act and the Rules, the official handbooks and notifications, the inquiry
-- craft, the templates and checklists, and the posters — so the module comes
-- back, with the same `p-toolkit` id it had before.
--
-- Reusing that id is safe precisely because 0029 was thorough: it stripped
-- `p-toolkit` out of every learner's `completed_items` as well as out of the
-- module list, so nobody is holding stale credit for an item that was a
-- placeholder. A delegate who "finished" the old toolkit reading in September
-- will be asked for this one.
--
-- WHERE IT GOES, and this is the point of the change rather than a detail:
-- last, after Delegate Feedback. The toolkit is what a delegate leaves with,
-- and the certificate comes after it.
--
-- WHAT THAT COSTS, stated plainly because it will surprise somebody:
-- `course_required_items` takes every id in `courses.modules[].itemIds`
-- regardless of whether the module is unlocked, and `issue_certificate`
-- refuses until the learner holds all of them. So from the moment this runs,
-- no PoSH certificate issues until
--
--   1. the office unlocks the Facilitator Toolkit module for the batch, and
--   2. the delegate opens the archive.
--
-- That is the gate that was asked for. It is not a bug, but a batch whose
-- toolkit is left locked will look like a certificate fault, so the report at
-- the bottom names everyone it currently stands in front of. Certificates
-- already issued are rows in `certificates` and are untouched — they keep
-- their number and their date.
--
-- ORDERING: deploy the website FIRST, then run this. Same rule as 0031 and
-- the opposite of 0021/0025/0029: a listed id the content does not render can
-- never be completed and would stall every PoSH certificate, while an
-- unlisted id that renders is merely uncounted. Additions follow the deploy;
-- removals lead it.
--
-- Scoped to PoSH by slug, and re-runnable — a second run finds the module
-- already there and changes nothing.

do $$
declare
  v_slug    text := 'posh-trainer';
  v_module  text := 'toolkit';
  v_item    text := 'p-toolkit';
  v_title   text := 'Facilitator Toolkit';
  v_modules jsonb;
  v_before  integer;
  v_after   integer;
begin
  select c.modules into v_modules from public.courses c where c.slug = v_slug;
  if not found then
    raise exception 'No course with slug %, so there is nothing to add the toolkit to.', v_slug
      using errcode = 'no_data_found';
  end if;
  v_modules := coalesce(v_modules, '[]'::jsonb);

  select count(*)::integer into v_before
    from jsonb_array_elements(v_modules) m,
         jsonb_array_elements_text(coalesce(m -> 'itemIds', '[]'::jsonb)) i;

  if exists (select 1 from jsonb_array_elements(v_modules) m where m ->> 'id' = v_module) then
    raise notice 'PoSH already lists a "%" module — nothing added.', v_module;
  else
    -- Appended, so it lands after Delegate Feedback, which is currently last.
    -- The shape matches 0015's seed exactly: the admin reads `summary`,
    -- `imageUrl`, `lessons` and `quiz` off these rows, and a module missing
    -- them renders as blanks rather than failing, which is harder to notice.
    v_modules := v_modules || jsonb_build_array(jsonb_build_object(
      'id',       v_module,
      'title',    v_title,
      'release',  'manual',
      'itemIds',  jsonb_build_array(v_item),
      'summary',  '',
      'imageUrl', '',
      'lessons',  '[]'::jsonb,
      -- Typed, not a bare null: jsonb_build_object takes "any", and an
      -- untyped null leaves it unable to resolve the polymorphic argument.
      'quiz',     'null'::jsonb
    ));

    update public.courses set modules = v_modules where slug = v_slug;
    raise notice 'Added the % module (%), last in the list.', v_module, v_item;
  end if;

  select count(*)::integer into v_after
    from public.courses c,
         jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) m,
         jsonb_array_elements_text(coalesce(m -> 'itemIds', '[]'::jsonb)) i
   where c.slug = v_slug;

  raise notice 'PoSH required items: % before, % after.', v_before, v_after;
end;
$$;

-- What PoSH now requires, in order.
select ord, m ->> 'title' as module, m ->> 'release' as release, m -> 'itemIds' as item_ids
  from public.courses c,
       jsonb_array_elements(c.modules) with ordinality as t(m, ord)
 where c.slug = 'posh-trainer'
 order by ord;

-- Who the new gate stands in front of.
--
-- `waiting_on` is what each learner still owes. A row whose only entry is
-- p-toolkit was finished before this ran: unlock the module for their batch
-- and the certificate follows. A row with nothing left can issue now.
with required as (
  select array_agg(item) as items
    from public.courses c
    cross join lateral jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) m
    cross join lateral jsonb_array_elements_text(coalesce(m -> 'itemIds', '[]'::jsonb)) item
   where c.slug = 'posh-trainer'
)
select u.email,
       nullif(trim(p.name), '')  as name,
       (select b.name
          from public.enrolments e
          join public.courses c2 on c2.id = e.course_id
          left join public.batches b on b.id = e.batch_id
         where e.user_id = cp.user_id
           and c2.slug = 'posh-trainer'
           and e.status <> 'cancelled'
         -- The seat that counts, where somebody is repeating the course:
         -- paid before pending, then the most recent. `status`, not a `paid`
         -- boolean — 0001 had one and a later migration replaced it.
         order by (e.status = 'paid') desc, e.created_at desc
         limit 1)                as batch,
       cardinality(r.items)      as required,
       owed.items                as waiting_on,
       coalesce(cardinality(owed.items), 0) as still_owed,
       exists (
         select 1
           from public.certificates ct
           join public.courses c3 on c3.id = ct.course_id
          where ct.user_id = cp.user_id
            and c3.slug = 'posh-trainer'
       )                         as already_has_certificate
  from public.course_progress cp
  cross join required r
  -- Set difference the long way round: Postgres has no `-` for text[], and
  -- the array operators that look like they would do it come from intarray.
  cross join lateral (
    select array_agg(i order by i) as items
      from unnest(r.items) as i
     where not (i = any (coalesce(cp.completed_items, '{}')))
  ) owed
  join auth.users u on u.id = cp.user_id
  left join public.profiles p on p.id = cp.user_id
 where cp.course_slug = 'posh-trainer'
 order by still_owed, u.email;
