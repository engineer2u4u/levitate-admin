-- Enrolments belong to a batch, live in the database, and stop trusting the
-- learner.
--
-- The table from 0001 has never been used: the admin kept enrolments in each
-- browser and the LMS in the learner's. It now becomes the one record of who
-- is enrolled on which run of a course — added by an admin from a phone or
-- email enquiry, or (a later migration) by the server after a verified
-- Razorpay payment.
--
-- Three things change about it:
--
--   · An enrolment is on a BATCH, not a session. Someone joins the October run
--     and attends all of its sessions; seats are counted per batch.
--
--   · Payment is a status — pending, paid, cancelled — stamped with when and by
--     whom. Cancelling keeps the row, so the history of a batch stays whole.
--
--   · Learners can no longer write it. 0001 said `paid` was not learner-
--     writable, but its policies let a signed-in learner insert or update
--     their own row with any value at all, `paid = true` included. Those two
--     policies are dropped; learners read their own rows and nothing more.
--
-- Also drops five progress columns nothing ever wrote. Progress lives in
-- `course_progress`, per learner and course.
--
-- Re-runnable, like the migrations before it.

-- ----------------------------------------------------------------- columns

alter table public.enrolments
  add column if not exists batch_id            uuid references public.batches on delete restrict,
  add column if not exists status              text not null default 'pending',
  -- The Razorpay payment link an admin pasted, to send on by WhatsApp or email.
  add column if not exists payment_link        text not null default '',
  add column if not exists paid_at             timestamptz,
  add column if not exists paid_by             uuid references auth.users on delete set null,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists razorpay_order_id   text not null default '',
  add column if not exists razorpay_payment_id text,
  add column if not exists invoice_no          text not null default '',
  -- When `user_id` was matched to a signed-up learner by email.
  add column if not exists linked_at           timestamptz,
  add column if not exists completed_at        timestamptz,
  add column if not exists certificate_sent_at timestamptz,
  add column if not exists toolkit_sent_at     timestamptz,
  add column if not exists last_send_error     text not null default '',
  add column if not exists notes               text not null default '',
  add column if not exists updated_at          timestamptz not null default now();

-- ---------------------------------------------------------------- backfill
--
-- Expected to touch nothing — neither app has ever written this table — but
-- written so that any row that does exist keeps its meaning.

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'enrolments' and column_name = 'paid') then
    update public.enrolments
       set status = 'paid', paid_at = coalesce(paid_at, created_at)
     where paid and status = 'pending';
    alter table public.enrolments drop column paid;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'enrolments' and column_name = 'session_id') then
    update public.enrolments e
       set batch_id = s.batch_id
      from public.sessions s
     where e.batch_id is null and s.id = e.session_id;
    alter table public.enrolments alter column session_id drop not null;
  end if;

  if not exists (select 1 from public.enrolments where batch_id is null) then
    alter table public.enrolments alter column batch_id set not null;
  else
    raise notice 'Some enrolments have no batch; batch_id left nullable until they are fixed.';
  end if;
end;
$$;

alter table public.enrolments drop constraint if exists enrolments_status_check;
alter table public.enrolments add constraint enrolments_status_check
  check (status in ('pending', 'paid', 'cancelled'));

-- Old check first, or it refuses the rename it is about to allow.
alter table public.enrolments drop constraint if exists enrolments_method_check;
update public.enrolments set method = 'offline' where method = 'paid';
alter table public.enrolments add constraint enrolments_method_check
  check (method in ('razorpay', 'link', 'invoice', 'offline'));

alter table public.enrolments drop constraint if exists enrolments_source_check;
alter table public.enrolments add constraint enrolments_source_check
  check (source in ('Admin', 'Website', 'Phone', 'Corporate'));

alter table public.enrolments drop constraint if exists enrolments_payment_link_https;
alter table public.enrolments add constraint enrolments_payment_link_https
  check (payment_link = '' or payment_link ~* '^https://');

alter table public.enrolments
  drop column if exists stages_unlocked,
  drop column if exists sessions_attended,
  drop column if exists completed_lessons,
  drop column if exists quiz_best,
  drop column if exists certificate_issued;

-- ----------------------------------------------------------------- indexes

drop index if exists public.enrolments_one_per_session;

-- One live enrolment per person per batch. Cancelled rows are history and do
-- not count, so someone who cancelled can be enrolled again.
create unique index if not exists enrolments_one_per_batch_email
  on public.enrolments (batch_id, lower(email))
  where status <> 'cancelled' and email <> '';

create unique index if not exists enrolments_one_per_batch_user
  on public.enrolments (user_id, batch_id)
  where user_id is not null and status <> 'cancelled';

-- A payment records one enrolment, however many times it is reported.
create unique index if not exists enrolments_razorpay_payment
  on public.enrolments (razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists enrolments_batch_idx on public.enrolments (batch_id);
create index if not exists enrolments_email_idx on public.enrolments (lower(email));

-- ---------------------------------------------------------------- triggers

-- Tidies every write: the email is matched on later, so it is stored
-- lowercased; the course always follows the batch; and payment and
-- cancellation are stamped when they change, by whoever changed them.
create or replace function public.enrolments_normalise()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(coalesce(new.email, '')));
  new.name := trim(new.name);
  new.phone := trim(coalesce(new.phone, ''));
  new.payment_link := trim(coalesce(new.payment_link, ''));
  new.updated_at := now();

  select b.course_id into new.course_id from public.batches b where b.id = new.batch_id;
  if new.course_id is null then
    raise exception 'That batch does not exist.' using errcode = 'foreign_key_violation';
  end if;

  if new.status = 'paid' then
    if tg_op = 'INSERT' or old.status <> 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
      new.paid_by := coalesce(new.paid_by, auth.uid());
    end if;
  else
    new.paid_at := null;
    new.paid_by := null;
  end if;

  if new.status = 'cancelled' then
    if tg_op = 'INSERT' or old.status <> 'cancelled' then
      new.cancelled_at := now();
    end if;
  else
    new.cancelled_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enrolments_normalise on public.enrolments;
create trigger enrolments_normalise
  before insert or update on public.enrolments
  for each row execute function public.enrolments_normalise();

-- Seats per batch, refused at the database rather than only in the UI.
--
-- Replaces 0001's per-session check, which ran with the caller's row-level
-- security (so it could not see other people's enrolments to count them) and
-- let two simultaneous enrolments both take the last seat. This one runs as
-- its owner and holds a lock on the batch while it counts.
create or replace function public.check_batch_capacity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  cap  integer;
  sold integer;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('batch-capacity:' || new.batch_id::text));

  select seats into cap from public.batches where id = new.batch_id;
  select coalesce(sum(seats), 0) into sold
    from public.enrolments
   where batch_id = new.batch_id
     and status <> 'cancelled'
     and (tg_op = 'INSERT' or id <> new.id);

  if cap is not null and sold + new.seats > cap then
    raise exception 'Batch is full: % of % seats already taken', sold, cap
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enrolments_capacity on public.enrolments;
drop trigger if exists enrolments_batch_capacity on public.enrolments;
create trigger enrolments_batch_capacity
  before insert or update of seats, batch_id, status on public.enrolments
  for each row execute function public.check_batch_capacity();

drop function if exists public.check_seat_capacity();

-- --------------------------------------------------------------------- RLS

-- The learner policies that let a browser write its own payment status.
drop policy if exists enrolments_own_insert on public.enrolments;
drop policy if exists enrolments_own_update on public.enrolments;

-- Kept from 0002: a learner reads their own rows, staff read all.
drop policy if exists enrolments_own_read on public.enrolments;
create policy enrolments_own_read on public.enrolments
  for select using (user_id = auth.uid() or public.is_staff());

-- Kept from 0001: admins write.
drop policy if exists enrolments_admin_write on public.enrolments;
create policy enrolments_admin_write on public.enrolments
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.enrolments from anon;
