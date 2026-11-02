-- Levitate LMS — put an enrolment on hold
--
-- The office needs to be able to stop a delegate mid-course and let them
-- carry on later: a cheque that bounced, a seat being moved between batches,
-- a conduct question. Until now the only lever was cancelling the enrolment,
-- which is destructive and loses the progress.
--
-- A hold is deliberately NOT a status value. `enrolments.status` is the
-- commercial record — pending, paid, cancelled — and it is what the payment
-- flow, the revenue figures and `issue_certificate` all read. Folding "on
-- hold" into it would have made every one of those places treat a paid seat
-- as unpaid, and unholding would have had to guess which status to restore.
-- A separate flag leaves the money record alone and is reversible by
-- construction.
--
-- Three doors have to be shut, not one. The player hides the course when it
-- sees the flag, but a browser is not a gate:
--
--   · `course_progress` — the learner site upserts this table directly under
--     RLS, so the check belongs in the policy. A held learner keeps every
--     item they had; they simply cannot add another.
--   · `record_assessment` — the quiz would otherwise still bank a score.
--   · `issue_certificate` — refuses to mint a new one, but still hands back
--     one already issued. See the comment at that check.
--
-- `my_course_access` also stops handing over the Zoom details and the
-- unlocked module list, which is the practical half of "cannot proceed":
-- those are what a held learner would otherwise still be able to use.
--
-- Either order against the website deploy. Before it, a held learner is
-- blocked by the database with the ordinary "could not save" path rather than
-- the hold screen; after it, they get the screen. Nothing is stalled by
-- running this first, so it is the safer half to run early.

-- ----------------------------------------------------------------- the flag

alter table public.enrolments
  -- Not null with a default so every existing row reads as "not on hold"
  -- without a backfill, and no caller has to handle null.
  add column if not exists on_hold   boolean not null default false,
  -- Why, for the office. Never sent to the learner: the hold screen tells
  -- them to call, which is a conversation, not a line of text on a page.
  add column if not exists hold_note text not null default '',
  add column if not exists held_at   timestamptz;

comment on column public.enrolments.on_hold is
  'Paused by the office: the learner keeps their progress but cannot add to it, sit the assessment, see session details or be issued a certificate.';

-- Held enrolments are the ones the office goes looking for, and there are
-- never many, so a partial index is both small and the one that gets used.
create index if not exists enrolments_on_hold_idx on public.enrolments (on_hold) where on_hold;

-- ------------------------------------------------------------ the hold test
--
-- security definer because the callers are RLS policies on another table:
-- evaluated as the learner, a join to `enrolments` would answer according to
-- the enrolments policies and could come back empty, which would read as
-- "not on hold" and open the gate it is there to shut.
create or replace function public.course_on_hold(p_course_slug text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
      from public.enrolments e
      join public.courses c on c.id = e.course_id
     where e.user_id = auth.uid()
       and c.slug = p_course_slug
       and e.status <> 'cancelled'
       and e.on_hold
  );
$$;

grant execute on function public.course_on_hold(text) to authenticated;

-- --------------------------------------------------------- progress is shut
--
-- Only the write side. Reading stays open: a held learner should still see
-- where they got to, and the hold screen is a better explanation than an
-- empty course would be.
drop policy if exists course_progress_own_insert on public.course_progress;
create policy course_progress_own_insert on public.course_progress
  for insert with check (user_id = auth.uid() and not public.course_on_hold(course_slug));

drop policy if exists course_progress_own_update on public.course_progress;
create policy course_progress_own_update on public.course_progress
  for update using (user_id = auth.uid())
              with check (user_id = auth.uid() and not public.course_on_hold(course_slug));

-- ----------------------------------------------------- issue_certificate
--
-- Carried over from 0035 unchanged but for the hold check below. The whole
-- body is restated because that is what `create or replace function` takes;
-- it was extracted from 0035 rather than retyped.

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

  -- On hold, and deliberately checked AFTER the refresh above: a certificate
  -- already issued is a record of something that happened, and withholding a
  -- second download of it punishes without achieving anything. What a hold
  -- stops is a NEW one being minted while the office has questions.
  if coalesce(v_enrol.on_hold, false) then
    raise exception 'This enrolment is on hold. Please contact the programme office.'
      using errcode = 'check_violation';
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

-- ------------------------------------------------------ my_course_access
--
-- Also from 0035. Two changes: the enrolment payload now carries `on_hold`,
-- and the live-session details and unlocked module list answer to a new
-- `v_open` (paid AND not held) instead of `v_is_paid`.

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
  -- Paid AND not on hold: what decides whether the live-session details and
  -- the unlocked module list are handed over at all.
  v_open    boolean;
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
  v_open    := v_is_paid and not coalesce(v_enrol.on_hold, false);

  return jsonb_build_object(
    'course', jsonb_build_object('slug', v_course.slug, 'title', v_course.title),
    'enrolment', jsonb_build_object(
      'id', v_enrol.id, 'status', v_enrol.status, 'payment_link', v_enrol.payment_link, 'paid_at', v_enrol.paid_at,
      -- Why the player shows the hold screen instead of the course. The note
      -- the office wrote is NOT sent: it is for the office, and the learner is
      -- told to call rather than read a reason off a screen.
      'on_hold', coalesce(v_enrol.on_hold, false)),
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
               'join_url',      case when v_open then coalesce(nullif(l.join_url, ''), nullif(v_link.join_url, '')) end,
               'meeting_id',    case when v_open then coalesce(nullif(l.meeting_id, ''), nullif(v_link.meeting_id, '')) end,
               'passcode',      case when v_open then coalesce(nullif(l.passcode, ''), nullif(v_link.passcode, '')) end,
               'recording_url', case when v_open then nullif(l.recording_url, '') end,
               -- A recording carries its own passcode, which is not the one
               -- that opened the live room.
               'recording_passcode', case when v_open then nullif(l.recording_passcode, '') end)
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
    'unlocked_module_ids', case when not v_open then '[]'::jsonb else coalesce((
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

-- ----------------------------------------------------- record_assessment
--
-- From 0027, with the hold check added.

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

  -- Its own check rather than "and not e.on_hold" on the clause above: a held
  -- delegate told "no paid enrolment for this course" would ring the office
  -- about the wrong problem.
  if public.course_on_hold(p_course_slug) then
    raise exception 'This enrolment is on hold. Please contact the programme office.'
      using errcode = 'check_violation';
  end if;

  insert into public.assessment_results (user_id, course_slug, item_id, score, total, passed)
  values (v_uid, p_course_slug, p_item_id, p_score, p_total, coalesce(p_passed, false))
  returning * into v_row;

  return v_row;
end;
$$;

-- ------------------------------------------------------------- after this
--
-- PostgREST caches the signatures of everything it exposes, and a changed
-- function body is not the same as a changed signature — but `on_hold` is a
-- new column on a table it serves, so the schema cache does need the nudge.
notify pgrst, 'reload schema';

-- Nothing is on hold yet. Shown so the result is "0 rows" rather than silence.
select e.id, e.email, e.on_hold, e.held_at, e.hold_note
  from public.enrolments e
 where e.on_hold
 order by e.held_at desc nulls last;
