-- Levitate LMS — alphanumeric certificate ids, and a register that holds
-- the ones printed by hand
--
-- Two changes, both about the number on the plate being real.
--
-- 1. The format. `2026-10-001` is a running count: it says how many have been
--    issued, and the next one is guessable from the last. A certificate number
--    is quoted to have a certificate checked, so it becomes
--    `LVT-2610-K7QF3M` — the month it was issued, then six characters from an
--    alphabet with no 0/O/1/I/L in it, since these get read off paper and
--    typed back in. Letters and digits mixed, unique by construction: the
--    generator looks for a free one rather than trusting the odds.
--
--    `next_cert_no()` keeps its name and both issue functions keep calling it,
--    so certificates the LMS issues on completion get the new format with no
--    other change. Numbers already issued are left exactly as they are — one
--    of them is in somebody's hands.
--
-- 2. The register. Until now a row required an enrolment, so the Certificates
--    screen — which prints for event attendees and guests who were never
--    enrolled — could not record anything at all. The number it put on a plate
--    existed nowhere. `enrolment_id` and `course_id` become nullable, and
--    `admin_record_certificate` writes a row for a certificate printed by
--    hand. "One certificate per enrolment, never two" is unaffected: the
--    unique index still holds for every row that names one, and Postgres does
--    not consider two nulls equal.
--
-- Re-runnable. Run in the Supabase SQL editor.

-- ------------------------------------------------------------- the format

/**
 * A certificate id: LVT-2610-K7QF3M.
 *
 * The alphabet leaves out 0, O, 1, I and L. Thirty-one characters over six
 * places is about 887 million per month, but the point is not the odds — the
 * loop below asks the register whether each candidate is free, so "unique" is
 * a fact rather than a probability. Ten attempts then give up, because at that
 * point something is wrong and silently returning a duplicate is worse.
 */
create or replace function public.new_cert_id(p_when timestamptz default now())
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_prefix   text := 'LVT-' || to_char(p_when, 'YYMM') || '-';
  v_body     text;
  v_candidate text;
begin
  for _ in 1 .. 10 loop
    v_body := '';
    for _ in 1 .. 6 loop
      v_body := v_body || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;

    v_candidate := v_prefix || v_body;
    if not exists (select 1 from public.certificates where cert_no = v_candidate) then
      return v_candidate;
    end if;
  end loop;

  raise exception 'Could not find a free certificate id after ten attempts.'
    using errcode = 'internal_error';
end;
$$;

revoke all on function public.new_cert_id(timestamptz) from public, anon, authenticated;

/**
 * The number for a certificate being issued now.
 *
 * Same name and signature as before, so `issue_certificate` and
 * `admin_issue_certificate` are untouched and start handing out the new format
 * immediately. The month's counter is still incremented: it no longer appears
 * in the id, but "how many went out in October" is worth being able to read.
 */
create or replace function public.next_cert_no(p_when timestamptz default now())
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.certificate_counters (period, issued)
  values (to_char(p_when, 'YYYY-MM'), 1)
  on conflict (period) do update set issued = certificate_counters.issued + 1;

  return public.new_cert_id(p_when);
end;
$$;

revoke all on function public.next_cert_no(timestamptz) from public, anon, authenticated;

/**
 * A free id for the Generate button, without issuing anything.
 *
 * Reserves nothing on purpose — an admin who generates an id and then closes
 * the screen has cost nothing, and the register's unique index is what
 * actually decides. Admin-only because it reads the register.
 */
create or replace function public.next_certificate_id()
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can generate a certificate id.' using errcode = '42501';
  end if;
  return public.new_cert_id();
end;
$$;

revoke all on function public.next_certificate_id() from public, anon;
grant execute on function public.next_certificate_id() to authenticated;

-- ------------------------------------------------------- room in the register

-- A certificate printed for a guest has no seat and may name a course that is
-- not in the catalogue, so neither can be required any more. The course title
-- is already snapshotted on the row, which is what the plate actually shows.
alter table public.certificates alter column enrolment_id drop not null;
alter table public.certificates alter column course_id drop not null;

-- Which format was printed, and where the row came from. A hand-printed
-- certificate is a different kind of record from one the LMS issued on
-- completion, and the register should not have to guess which it is looking at.
alter table public.certificates add column if not exists template text not null default 'excellence';
alter table public.certificates add column if not exists source text not null default 'course';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'certificates_source_check'
  ) then
    alter table public.certificates
      add constraint certificates_source_check check (source in ('course', 'manual'));
  end if;
end;
$$;

-- --------------------------------------------- recording a printed one

/**
 * Record a certificate the office printed by hand.
 *
 * Called when one is downloaded from the Certificates screen, so that what is
 * on the plate is also in the register and can be checked later. Idempotent on
 * the id: downloading the same certificate as PDF and then as PNG, or twice
 * over, records it once and returns the row already held.
 *
 * It deliberately does not check completion or require an enrolment — that is
 * the whole point of this path. `issued_by` records who printed it.
 */
create or replace function public.admin_record_certificate(
  p_cert_no      text,
  p_name         text,
  p_course_title text,
  p_template     text default 'excellence',
  p_completed_on date default null,
  p_hours        text default '',
  p_pdcs         text default '',
  p_cpd_hours    text default '',
  p_course_id    uuid default null
)
returns public.certificates
language plpgsql
security definer set search_path = public
as $$
declare
  v_cert public.certificates;
  v_no   text := nullif(trim(coalesce(p_cert_no, '')), '');
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only an admin can record a certificate.' using errcode = '42501';
  end if;
  if v_no is null then
    raise exception 'A certificate needs an id.' using errcode = 'check_violation';
  end if;
  if v_name is null then
    raise exception 'A certificate needs a recipient name.' using errcode = 'check_violation';
  end if;

  -- Already recorded? Then this is a second download of the same certificate.
  select * into v_cert from public.certificates where cert_no = v_no;
  if v_cert.id is not null then
    return v_cert;
  end if;

  insert into public.certificates
    (cert_no, enrolment_id, user_id, course_id, batch_id,
     recipient_name, course_title, hours, pdcs, cpd_hours,
     completed_on, issued_by, template, source)
  values
    (v_no, null, null, p_course_id, null,
     v_name, coalesce(nullif(trim(coalesce(p_course_title, '')), ''), 'Course'),
     coalesce(p_hours, ''), coalesce(p_pdcs, ''), coalesce(p_cpd_hours, ''),
     coalesce(p_completed_on, current_date), auth.uid(),
     coalesce(nullif(trim(coalesce(p_template, '')), ''), 'excellence'), 'manual')
  returning * into v_cert;

  return v_cert;
end;
$$;

revoke all on function public.admin_record_certificate(text, text, text, text, date, text, text, text, uuid)
  from public, anon;
grant execute on function public.admin_record_certificate(text, text, text, text, date, text, text, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';

-- What the register holds, and what the next id would look like.
select source, count(*) as certificates, min(cert_no) as example
  from public.certificates
 group by source
 order by source;
