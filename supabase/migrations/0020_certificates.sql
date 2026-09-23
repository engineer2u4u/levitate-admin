-- Levitate LMS — the certificate register
--
-- The plate calls a certificate "verifiable", which is a promise: someone
-- holding one must be able to have it checked. Until now nothing issued or
-- recorded a number — the admin's Certificates screen typed one into a box and
-- suggested `YYYY-MM-001` every time. This makes the number real.
--
-- The shape of the thing:
--   * one certificate per enrolment, never two — a second request returns the
--     first, so a learner refreshing the page does not mint numbers;
--   * the number is sequential within the month it was issued;
--   * the recipient's name and the course title are SNAPSHOTTED at issue.
--     A learner who later corrects their name, or a course that gets retitled,
--     must not silently rewrite a certificate already in someone's hands;
--   * a learner may issue their own once every item is complete; the office
--     may issue one for somebody with no account;
--   * revoking is possible and recorded, because a promise of verifiability
--     is worth nothing if a mistake can only be deleted.
--
-- Re-runnable. Run in the Supabase SQL editor.

-- ------------------------------------------------------------- numbering

-- One row per month, holding how many have been issued in it. A table rather
-- than a sequence because the count restarts each month and must be readable.
create table if not exists public.certificate_counters (
  period  text primary key,
  issued  integer not null default 0
);

alter table public.certificate_counters enable row level security;
revoke all on public.certificate_counters from anon, authenticated;

/**
 * The next number, as 2026-09-001.
 *
 * Takes the month's row and increments it in one statement, so two learners
 * finishing at the same moment cannot be handed the same number: the second
 * waits on the first's row lock and sees the incremented value.
 */
create or replace function public.next_cert_no(p_when timestamptz default now())
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_period text := to_char(p_when, 'YYYY-MM');
  v_n      integer;
begin
  insert into public.certificate_counters (period, issued)
  values (v_period, 1)
  on conflict (period) do update set issued = certificate_counters.issued + 1
  returning issued into v_n;

  return v_period || '-' || lpad(v_n::text, 3, '0');
end;
$$;

revoke all on function public.next_cert_no(timestamptz) from public, anon, authenticated;

-- ----------------------------------------------------------- certificates

create table if not exists public.certificates (
  id            uuid primary key default gen_random_uuid(),
  cert_no       text not null unique,
  -- restrict, not cascade: deleting an enrolment must never quietly destroy
  -- the record of a certificate issued against it.
  enrolment_id  uuid not null unique references public.enrolments on delete restrict,
  user_id       uuid references auth.users on delete set null,
  course_id     uuid not null references public.courses on delete restrict,
  batch_id      uuid references public.batches on delete set null,
  -- Snapshots. Deliberately not joined live — see the header.
  recipient_name text not null,
  course_title   text not null,
  hours          text not null default '',
  completed_on   date not null,
  issued_at      timestamptz not null default now(),
  -- Null means the learner issued it themselves on finishing.
  issued_by      uuid references auth.users on delete set null,
  revoked_at     timestamptz,
  revoked_reason text not null default ''
);

create index if not exists certificates_user on public.certificates (user_id);
create index if not exists certificates_course on public.certificates (course_id);

alter table public.certificates enable row level security;

-- A learner reads their own; staff read all. Nobody writes directly: every
-- write goes through the functions below, which decide whether it is earned.
drop policy if exists certificates_read on public.certificates;
create policy certificates_read on public.certificates
  for select using (user_id = auth.uid() or public.is_staff());

revoke all on public.certificates from anon;
grant select on public.certificates to authenticated;

-- --------------------------------------------- what counts as finished

/**
 * Every LMS item a course requires, from `courses.modules[].itemIds`.
 *
 * Empty for a course whose lesson content is not in the website's code yet —
 * and an empty requirement must never read as "finished", which is why the
 * callers below refuse to issue when this comes back empty.
 */
create or replace function public.course_required_items(p_course_id uuid)
returns text[]
language sql
stable
security definer set search_path = public
as $$
  select coalesce(array_agg(item), '{}')
    from public.courses c
    cross join lateral jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) m
    cross join lateral jsonb_array_elements_text(coalesce(m -> 'itemIds', '[]'::jsonb)) item
   where c.id = p_course_id;
$$;

-- ------------------------------------------------ the learner's own issue

/**
 * Issue the caller's certificate for a course, or hand back the one they
 * already have.
 *
 * Refuses unless they hold a paid enrolment and have completed every item the
 * course requires. The check is here rather than in the browser because this
 * is the only place it cannot be skipped.
 */
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

  select coalesce(cp.completed_at, now())::date
    into v_when
    from public.course_progress cp
   where cp.user_id = v_uid and cp.course_slug = p_course_slug;

  insert into public.certificates
    (cert_no, enrolment_id, user_id, course_id, batch_id,
     recipient_name, course_title, hours, completed_on, issued_by)
  values
    (public.next_cert_no(), v_enrol.id, v_uid, v_course.id, v_enrol.batch_id,
     v_name, v_course.title, coalesce(v_course.duration, ''), coalesce(v_when, current_date), null)
  returning * into v_cert;

  return v_cert;
end;
$$;

revoke all on function public.issue_certificate(text, text) from public, anon;
grant execute on function public.issue_certificate(text, text) to authenticated;

-- ---------------------------------------------------- the office's issue

/**
 * Issue on someone's behalf — for a learner with no account, or a seat the
 * office is satisfied about without the LMS having recorded every item.
 *
 * That judgement is the difference from issue_certificate: completion is not
 * checked, so `issued_by` records who decided.
 */
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

  v_name := coalesce(nullif(trim(coalesce(p_name, '')), ''), nullif(trim(v_enrol.name), ''), 'Learner');

  insert into public.certificates
    (cert_no, enrolment_id, user_id, course_id, batch_id,
     recipient_name, course_title, hours, completed_on, issued_by)
  values
    (public.next_cert_no(), v_enrol.id, v_enrol.user_id, v_enrol.course_id, v_enrol.batch_id,
     v_name, coalesce(v_course.title, 'Levitate programme'), coalesce(v_course.duration, ''),
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

-- --------------------------------------------------------------- revoke

-- Withdrawn, not erased: a number that was once given out stays in the
-- register, so checking it says "revoked" rather than "never existed".
create or replace function public.admin_revoke_certificate(
  p_cert_id uuid,
  p_reason  text default ''
)
returns public.certificates
language plpgsql
security definer set search_path = public
as $$
declare
  v_cert public.certificates;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can revoke a certificate.' using errcode = '42501';
  end if;

  update public.certificates
     set revoked_at = now(),
         revoked_reason = coalesce(nullif(trim(p_reason), ''), 'Revoked by the office.')
   where id = p_cert_id
   returning * into v_cert;

  if v_cert.id is null then
    raise exception 'That certificate does not exist.' using errcode = 'no_data_found';
  end if;

  return v_cert;
end;
$$;

revoke all on function public.admin_revoke_certificate(uuid, text) from public, anon;
grant execute on function public.admin_revoke_certificate(uuid, text) to authenticated;

notify pgrst, 'reload schema';
