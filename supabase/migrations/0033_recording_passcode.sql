-- Levitate LMS — a recording link's own passcode
--
-- Zoom gives a cloud recording its own passcode, separate from the one that
-- opened the live room. We stored one passcode per session and handed it to
-- learners alongside the recording, which is the wrong one: it opens the
-- meeting, not the playback, so anyone following the link was asked for a code
-- they had never been given.
--
-- Per session rather than per batch, unlike the join details: a batch's room
-- is reused every week, but each recording is its own file with its own code.
-- `batch_links` is therefore untouched.
--
-- `my_course_access` is the only way a learner sees any of this, so it carries
-- the new field too — gated on a paid seat exactly as the rest already is.
-- The function below is 0024's, with one key added; nothing else about it has
-- been retyped.
--
-- Re-runnable. Run in the Supabase SQL editor.

alter table public.session_links
  add column if not exists recording_passcode text not null default '';

comment on column public.session_links.recording_passcode is
  'Zoom cloud recordings carry a passcode of their own, separate from the meeting passcode.';

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
               'recording_url', case when v_is_paid then nullif(l.recording_url, '') end,
               -- A recording carries its own passcode, which is not the one
               -- that opened the live room.
               'recording_passcode', case when v_is_paid then nullif(l.recording_passcode, '') end)
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

-- Sessions holding a recording, and whether its passcode is set.
select s.date_label, l.recording_url <> '' as has_recording,
       l.recording_passcode <> '' as has_passcode
  from public.sessions s
  join public.session_links l on l.session_id = s.id
 where l.recording_url <> ''
 order by s.starts_on nulls last;
