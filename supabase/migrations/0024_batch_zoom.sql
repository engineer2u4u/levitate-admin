-- Levitate LMS — one Zoom room for a batch, overridable per session
--
-- A cohort usually runs every session in the same Zoom room, so typing the
-- same join link into eight sessions is eight chances to mistype the one thing
-- a learner cannot work around. The room goes on the batch; a session uses it
-- unless it carries a link of its own.
--
-- Inherited at read time rather than copied into each session, so correcting
-- the room once corrects every session still using it. A session that needs
-- its own — a guest speaker, a rescheduled sitting — simply has one, and that
-- always wins.
--
-- Its own table, like session_links and for the same reason: anon may read
-- `batches` for the website's dates, and a Zoom link is not for anon.
--
-- Re-runnable. Run in the Supabase SQL editor.

create table if not exists public.batch_links (
  batch_id    uuid primary key references public.batches on delete cascade,
  join_url    text not null default '',
  meeting_id  text not null default '',
  passcode    text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.batch_links drop constraint if exists batch_links_https;
alter table public.batch_links add constraint batch_links_https
  check (join_url = '' or join_url ~* '^https://');

alter table public.batch_links enable row level security;
revoke all on public.batch_links from anon;
grant select, insert, update, delete on public.batch_links to authenticated;

-- Staff only, exactly as session_links: a learner never reads this table, they
-- read my_course_access below, which hands out the room only once paid.
drop policy if exists batch_links_staff_read on public.batch_links;
create policy batch_links_staff_read on public.batch_links
  for select using (public.is_staff());

drop policy if exists batch_links_admin_write on public.batch_links;
create policy batch_links_admin_write on public.batch_links
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.batch_links_touch()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists batch_links_touch on public.batch_links;
create trigger batch_links_touch
  before insert or update on public.batch_links
  for each row execute function public.batch_links_touch();

-- ------------------------------------------- what the learner is given
--
-- 0017's function, unchanged but for the three joining fields, which now fall
-- back to the batch's room. The recording does not: it belongs to the sitting
-- it was made at and is never shared across a batch.

create or replace function public.my_course_access(p_slug text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  me        uuid := auth.uid();
  v_course  public.courses%rowtype;
  v_enrol   public.enrolments%rowtype;
  v_batch   public.batches%rowtype;
  v_link    public.batch_links%rowtype;
  v_is_paid boolean;
begin
  if me is null then
    return null;
  end if;

  select * into v_course from public.courses where slug = p_slug;
  if not found then
    return null;
  end if;

  -- The enrolment that counts: paid before pending, then the latest run.
  select en.* into v_enrol
    from public.enrolments en
    join public.batches bt on bt.id = en.batch_id
   where en.user_id = me and en.course_id = v_course.id and en.status <> 'cancelled'
   order by (en.status = 'paid') desc, bt.starts_on desc nulls last, en.created_at desc
   limit 1;
  if not found then
    return null;
  end if;

  select * into v_batch from public.batches where id = v_enrol.batch_id;
  select * into v_link  from public.batch_links where batch_id = v_enrol.batch_id;
  v_is_paid := v_enrol.status = 'paid';

  return jsonb_build_object(
    'course', jsonb_build_object('slug', v_course.slug, 'title', v_course.title),
    'enrolment', jsonb_build_object(
      'id', v_enrol.id, 'status', v_enrol.status, 'payment_link', v_enrol.payment_link, 'paid_at', v_enrol.paid_at),
    'batch', jsonb_build_object(
      'id', v_batch.id, 'name', v_batch.name, 'status', v_batch.status,
      'starts_on', v_batch.starts_on, 'ends_on', v_batch.ends_on),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'starts_on', s.starts_on, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
               'date_label', s.date_label, 'time_label', s.time_label, 'topic', s.topic,
               'mode', s.mode, 'trainer', s.trainer,
               'join_url',      case when v_is_paid then coalesce(nullif(l.join_url, ''), nullif(v_link.join_url, '')) end,
               'meeting_id',    case when v_is_paid then coalesce(nullif(l.meeting_id, ''), nullif(v_link.meeting_id, '')) end,
               'passcode',      case when v_is_paid then coalesce(nullif(l.passcode, ''), nullif(v_link.passcode, '')) end,
               'recording_url', case when v_is_paid then nullif(l.recording_url, '') end)
             order by s.starts_on nulls last, s.starts_at nulls last)
        from public.sessions s
        left join public.session_links l on l.session_id = s.id
       where s.batch_id = v_batch.id and s.status <> 'draft'
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.m->>'id', 'title', t.m->>'title',
               'release', coalesce(t.m->>'release', 'manual'),
               'item_ids', coalesce(t.m->'itemIds', '[]'::jsonb))
             order by t.ord)
        from jsonb_array_elements(coalesce(v_course.modules, '[]'::jsonb)) with ordinality as t(m, ord)
    ), '[]'::jsonb),
    'unlocked_module_ids', case when not v_is_paid then '[]'::jsonb else coalesce((
      select jsonb_agg(distinct ids.module_id)
        from (
          select t.m->>'id' as module_id
            from jsonb_array_elements(coalesce(v_course.modules, '[]'::jsonb)) as t(m)
           where coalesce(t.m->>'release', 'manual') = 'enrolment'
          union
          select u.module_id from public.batch_module_unlocks u where u.batch_id = v_batch.id
        ) ids
    ), '[]'::jsonb) end,
    'next_session', (
      select jsonb_build_object(
               'starts_on', s.starts_on, 'starts_at', s.starts_at,
               'date_label', s.date_label, 'time_label', s.time_label, 'topic', s.topic)
        from public.sessions s
       where s.batch_id = v_batch.id and s.status <> 'draft'
         and coalesce(s.starts_at, (s.starts_on + 1)::timestamptz) > now()
       order by s.starts_on nulls last, s.starts_at nulls last
       limit 1)
  );
end;
$$;

revoke all on function public.my_course_access(text) from public, anon;
grant execute on function public.my_course_access(text) to authenticated;

notify pgrst, 'reload schema';
