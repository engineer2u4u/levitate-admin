-- Levitate LMS — a certificate that carries everything it claims
--
-- Three things, all about the certificate someone is handed at the end.
--
-- 1. Hours, SHRM PDCs and CPD points go on the BATCH. They are properties of
--    the run that taught them, not of the course: a twelve-hour October and a
--    fifteen-hour November are the same course, and an accreditation can be
--    granted for one cohort and not the next. The certificate snapshots them
--    at issue, as it already snapshots the name and the title, so correcting a
--    future batch never rewrites a certificate already in someone's hands.
--
-- 2. The certificate keeps them. Printing "PDCs: —" on a programme that earns
--    twelve is worse than printing nothing, and the LMS can only print what
--    the register holds.
--
-- 3. The numbering is moved past what has already been handed out. Thirty
--    masterclass certificates were made outside the register, numbered
--    2026-10-001 to 2026-10-030, and the counter has never heard of them: the
--    next certificate issued this month would be 2026-10-001 a second time,
--    on a different person's name. A number that identifies two people
--    identifies nobody. The counter is moved to 30 so the next is 031.
--
-- Re-runnable. Run in the Supabase SQL editor.

alter table public.batches
  add column if not exists hours_label text not null default '',
  add column if not exists pdcs        text not null default '',
  add column if not exists cpd_hours   text not null default '';

comment on column public.batches.hours_label is
  'Teaching hours as the certificate prints them, e.g. "12 Hours".';
comment on column public.batches.pdcs is
  'SHRM professional development credits this run carries, e.g. "12". Blank where it carries none.';
comment on column public.batches.cpd_hours is
  'CPD points or hours this run carries. Blank where it carries none.';

grant select (hours_label, pdcs, cpd_hours) on public.batches to anon;

alter table public.certificates
  add column if not exists pdcs      text not null default '',
  add column if not exists cpd_hours text not null default '';

-- ------------------------------------------------- numbering, moved on
--
-- Only ever forwards. A counter that went backwards would hand out a number
-- twice, which is the one thing it exists to prevent.
insert into public.certificate_counters (period, issued)
values ('2026-10', 30)
on conflict (period) do update
  set issued = greatest(certificate_counters.issued, excluded.issued);

-- --------------------------------------------- issuing, with the figures

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

  -- Their own name, as they gave it. Trimmed, and never blank on a plate.
  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    select nullif(trim(p.name), '') into v_name from public.profiles p where p.id = v_uid;
  end if;
  v_name := coalesce(v_name, nullif(trim(v_enrol.name), ''), 'Learner');

  -- The hours, PDCs and CPD points a certificate prints belong to the run
  -- that taught them, so they come from the batch, falling back to the course.
  select * into v_batch from public.batches where id = v_enrol.batch_id;

  select coalesce(cp.completed_at, now())::date
    into v_when
    from public.course_progress cp
   where cp.user_id = v_uid and cp.course_slug = p_course_slug;

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
     coalesce(p_completed_on, current_date), auth.uid())
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

notify pgrst, 'reload schema';

-- What each batch now puts on a certificate, and where the numbering stands.
select c.slug, b.name, b.hours_label, b.pdcs, b.cpd_hours
  from public.batches b join public.courses c on c.id = b.course_id
 order by c.slug, b.starts_on;

select period, issued from public.certificate_counters order by period;
