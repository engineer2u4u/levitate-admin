-- Levitate LMS — a certificate dates from the programme, not from the learner
--
-- Three things, all one decision: a run of a programme finishes when the
-- office says it finished.
--
-- 1. `batches.completed_on` — the day the run concluded, supplied when it is
--    marked complete. A date, not a timestamp: it is printed, not logged.
--
-- 2. `issue_certificate` refuses until the batch is marked complete. Until now
--    a learner who finished the last reading could take a certificate out of a
--    programme that was still running.
--
-- 3. That certificate is dated from the batch rather than from the learner's
--    own completion. Two delegates on one programme were holding certificates
--    dated days apart, each one dated whenever they happened to click through
--    the last item. `admin_issue_certificate` takes the same default, while
--    still letting the office type a date of its own — issuing by hand is a
--    judgement call, which is why it has no batch gate.
--
-- `my_course_access` carries the batch's completion date so the player knows
-- whether to offer the certificate page at all.
--
-- The three functions are the live ones — issue_certificate and
-- admin_issue_certificate from 0028, my_course_access from 0033 — extracted
-- and patched, not retyped.
--
-- Re-runnable. Run in the Supabase SQL editor.

alter table public.batches
  add column if not exists completed_on date;

comment on column public.batches.completed_on is
  'The day this run of the programme concluded. Printed on every certificate issued out of it.';

-- Runs already marked complete keep the day they were marked, so certificates
-- issued from them are dated rather than blank.
update public.batches
   set completed_on = completed_at::date
 where status = 'completed'
   and completed_on is null
   and completed_at is not null;

create or replace function public.issue_certificate(
  p_course_slug text,
  p_name        text default null
)
returns public.certificates
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_enrol    public.enrolments;
  v_course   public.courses;
  v_required text[];
  v_done     text[];
  v_name     text;
  v_cert     public.certificates;
  v_batch    public.batches;
  v_when     date;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select c.* into v_course from public.courses c where c.slug = p_course_slug;
  if v_course.id is null then
    raise exception 'No such course.' using errcode = 'no_data_found';
  end if;

  -- The paid seat, newest first: someone repeating a course has more than one.
  select e.* into v_enrol
    from public.enrolments e
   where e.user_id = v_uid
     and e.course_id = v_course.id
     and e.status = 'paid'
   order by e.created_at desc
   limit 1;

  if v_enrol.id is null then
    raise exception 'No paid enrolment for this course.' using errcode = '42501';
  end if;

  -- Already issued? Then this is a refresh, not a second certificate.
  select * into v_cert from public.certificates where enrolment_id = v_enrol.id;
  if v_cert.id is not null then
    return v_cert;
  end if;

  v_required := public.course_required_items(v_course.id);
  if array_length(v_required, 1) is null then
    raise exception 'This course has no lesson list yet, so completion cannot be checked.'
      using errcode = 'check_violation';
  end if;

  select coalesce(cp.completed_items, '{}')
    into v_done
    from public.course_progress cp
   where cp.user_id = v_uid and cp.course_slug = p_course_slug;

  if v_done is null or not (v_required <@ coalesce(v_done, '{}')) then
    raise exception 'The course is not finished yet.' using errcode = 'check_violation';
  end if;

  -- The batch has to be closed before anyone is certified out of it. A
  -- certificate dates from the programme, not from the learner's last click,
  -- so until the office marks the run complete there is no date to print and
  -- nothing to issue.
  select * into v_batch from public.batches where id = v_enrol.batch_id;
  if v_batch.status is distinct from 'completed' then
    raise exception 'This programme has not been marked complete yet.' using errcode = 'check_violation';
  end if;

  -- Their own name, as they gave it. Trimmed, and never blank on a plate.
  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    select nullif(trim(p.name), '') into v_name from public.profiles p where p.id = v_uid;
  end if;
  v_name := coalesce(v_name, nullif(trim(v_enrol.name), ''), 'Learner');

  -- The hours, PDCs and CPD points a certificate prints belong to the run
  -- that taught them, so they come from the batch, read above.
  --
  -- And so does the date. It used to be the learner's own completion date,
  -- which meant two delegates on the same programme held certificates dated
  -- days apart — and one dated whenever they happened to finish the last
  -- reading. The programme ended when the office says it ended.
  v_when := coalesce(v_batch.completed_on, v_batch.completed_at::date);

  insert into public.certificates
    (cert_no, enrolment_id, user_id, course_id, batch_id,
     recipient_name, course_title, hours, pdcs, cpd_hours, completed_on, issued_by)
  values
    (public.next_cert_no(), v_enrol.id, v_uid, v_course.id, v_enrol.batch_id,
     v_name, v_course.title,
     coalesce(nullif(v_batch.hours_label, ''), v_course.duration, ''),
     coalesce(v_batch.pdcs, ''), coalesce(v_batch.cpd_hours, ''),
     coalesce(v_when, current_date), null)
  returning * into v_cert;

  return v_cert;
end;
$$;

revoke all on function public.issue_certificate(text, text) from public, anon;
grant execute on function public.issue_certificate(text, text) to authenticated;

create or replace function public.admin_issue_certificate(
  p_enrolment_id uuid,
  p_name         text default null,
  p_completed_on date default null
)
returns public.certificates
language plpgsql
security definer set search_path = public
as $$
declare
  v_enrol  public.enrolments;
  v_course public.courses;
  v_cert   public.certificates;
  v_name   text;
  v_batch  public.batches;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can issue a certificate for someone else.'
      using errcode = '42501';
  end if;

  select * into v_enrol from public.enrolments where id = p_enrolment_id;
  if v_enrol.id is null then
    raise exception 'That enrolment does not exist.' using errcode = 'no_data_found';
  end if;
  if v_enrol.status <> 'paid' then
    raise exception 'That seat is not paid for.' using errcode = 'check_violation';
  end if;

  select * into v_cert from public.certificates where enrolment_id = v_enrol.id;
  if v_cert.id is not null then
    return v_cert;
  end if;

  select * into v_course from public.courses where id = v_enrol.course_id;
  select * into v_batch  from public.batches where id = v_enrol.batch_id;

  v_name := coalesce(nullif(trim(coalesce(p_name, '')), ''), nullif(trim(v_enrol.name), ''), 'Learner');

  insert into public.certificates
    (cert_no, enrolment_id, user_id, course_id, batch_id,
     recipient_name, course_title, hours, pdcs, cpd_hours, completed_on, issued_by)
  values
    (public.next_cert_no(), v_enrol.id, v_enrol.user_id, v_enrol.course_id, v_enrol.batch_id,
     v_name, coalesce(v_course.title, 'Levitate programme'),
     coalesce(nullif(v_batch.hours_label, ''), v_course.duration, ''),
     coalesce(v_batch.pdcs, ''), coalesce(v_batch.cpd_hours, ''),
     -- What the office typed, else the day the programme was marked
     -- complete. current_date is the last resort, for a seat on no batch.
     coalesce(p_completed_on, v_batch.completed_on, v_batch.completed_at::date, current_date), auth.uid())
  returning * into v_cert;

  -- The enrolment now has a finish date, if it did not already.
  update public.enrolments
     set completed_at = coalesce(completed_at, now())
   where id = v_enrol.id;

  return v_cert;
end;
$$;

revoke all on function public.admin_issue_certificate(uuid, text, date) from public, anon;
grant execute on function public.admin_issue_certificate(uuid, text, date) to authenticated;

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
      'starts_on', v_batch.starts_on, 'ends_on', v_batch.ends_on,
      -- The day the office closed the run. What every certificate out of this
      -- batch is dated, and what the player gates its certificate page on.
      'completed_on', coalesce(v_batch.completed_on, v_batch.completed_at::date)),
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

-- Which runs are closed, and what their certificates will be dated.
select c.title, b.name, b.status, b.completed_on,
       (select count(*) from public.certificates ct where ct.batch_id = b.id) as certificates
  from public.batches b
  join public.courses c on c.id = b.course_id
 order by b.starts_on desc nulls last;
