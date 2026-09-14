-- What a learner can reach, decided by the database.
--
-- Phase 2 of batches (0013–0015). Adds:
--
--   · Claim codes. The LMS does not confirm email addresses, so matching an
--     enrolment to an account by email alone would let anyone who knows a
--     learner's address take their seat. Instead every enrolment carries a
--     code ("LVT-7K3QXM") that the admin sends in their WhatsApp or email; the
--     learner enters it once to attach the enrolment to their account.
--     Someone who buys on the LMS pays while signed in, so theirs is attached
--     at purchase and needs no code.
--
--   · Module unlocks. After each live session an admin opens modules for the
--     whole batch. A module whose `release` is "enrolment" is open from the
--     start; the rest wait for an unlock row here.
--
--   · The functions the LMS calls: claim_enrolment, my_course_access (the
--     learner's batch, sessions, Zoom links once paid, and which modules are
--     open), and batch_seats_left for the checkout.
--
--   · record_paid_enrolment, callable only with the service key, which the
--     payment server uses after verifying a Razorpay payment.
--
-- Numbered 0017: 0016 is the enquiry source columns, written separately.
-- Re-runnable, like the migrations before it.

-- ------------------------------------------------------------- claim codes

alter table public.enrolments
  add column if not exists claim_code text;

create unique index if not exists enrolments_claim_code
  on public.enrolments (claim_code)
  where claim_code is not null;

-- "LVT-" and six characters of Crockford's base-32 alphabet, which leaves out
-- I, L, O and U so a code read off a phone and retyped cannot be misread.
-- The randomness comes from gen_random_uuid(), which draws on the operating
-- system's secure generator, unlike random(). Bytes 0–5 of a v4 UUID are
-- fully random and 256 divides evenly by 32, so every character is equally
-- likely: about a billion codes.
create or replace function public.new_claim_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  raw  bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  end loop;
  return 'LVT-' || code;
end;
$$;

-- Given once, on insert, and kept. Runs as its owner so it can check the
-- whole table for a clash, whoever is inserting.
create or replace function public.enrolments_assign_claim_code()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.claim_code is null then
    loop
      new.claim_code := public.new_claim_code();
      exit when not exists (select 1 from public.enrolments where claim_code = new.claim_code);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists enrolments_claim_code on public.enrolments;
create trigger enrolments_claim_code
  before insert or update on public.enrolments
  for each row execute function public.enrolments_assign_claim_code();

-- Rows from before codes existed get theirs now: touching them runs the trigger.
update public.enrolments set updated_at = now() where claim_code is null;

-- ---------------------------------------------------------- module unlocks

create table if not exists public.batch_module_unlocks (
  batch_id         uuid not null references public.batches on delete cascade,
  -- An id from the course's `modules` list, e.g. "clear-framework".
  module_id        text not null,
  unlocked_at      timestamptz not null default now(),
  unlocked_by      uuid references auth.users on delete set null default auth.uid(),
  -- The live session it was opened after, for the record. Optional.
  after_session_id uuid references public.sessions on delete set null,
  primary key (batch_id, module_id)
);

-- Refuses an id the course does not have: a typo would otherwise unlock
-- nothing and look as if it had worked.
create or replace function public.batch_module_unlocks_check()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.batches b
      join public.courses c on c.id = b.course_id
      cross join lateral jsonb_array_elements(coalesce(c.modules, '[]'::jsonb)) m
     where b.id = new.batch_id and m->>'id' = new.module_id
  ) then
    raise exception 'That course has no module "%".', new.module_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists batch_module_unlocks_check on public.batch_module_unlocks;
create trigger batch_module_unlocks_check
  before insert or update on public.batch_module_unlocks
  for each row execute function public.batch_module_unlocks_check();

alter table public.batch_module_unlocks enable row level security;

revoke all on public.batch_module_unlocks from anon;
grant select, insert, update, delete on public.batch_module_unlocks to authenticated;

drop policy if exists batch_module_unlocks_staff_read on public.batch_module_unlocks;
create policy batch_module_unlocks_staff_read on public.batch_module_unlocks
  for select using (public.is_staff());

drop policy if exists batch_module_unlocks_admin_write on public.batch_module_unlocks;
create policy batch_module_unlocks_admin_write on public.batch_module_unlocks
  for all using (public.is_admin()) with check (public.is_admin());

-- Viewers read every screen, learner progress included (0004 said admins only).
drop policy if exists course_progress_own_read on public.course_progress;
create policy course_progress_own_read on public.course_progress
  for select using (user_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------- claiming a code

-- Failed attempts, so a code cannot be guessed by trying every combination.
-- Nobody reads this table directly; only claim_enrolment writes it.
create table if not exists public.claim_attempts (
  user_id      uuid not null references auth.users on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists claim_attempts_user_idx on public.claim_attempts (user_id, attempted_at);
alter table public.claim_attempts enable row level security;
revoke all on public.claim_attempts from anon, authenticated;

-- Attaches the enrolment a code belongs to to the signed-in account.
--
-- Answers { ok, error? , course_slug? } rather than raising: a raised error
-- would also roll back the record of the failed attempt, and the limit on
-- attempts would count nothing.
create or replace function public.claim_enrolment(p_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  me       uuid := auth.uid();
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]]', '', 'g'));
  v_row    public.enrolments%rowtype;
  v_slug   text;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in first, then enter your code.');
  end if;

  if (select count(*) from public.claim_attempts
       where user_id = me and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Too many attempts. Try again in an hour, or ask us to resend your code.');
  end if;

  -- Accepted with or without its "LVT-" prefix.
  if v_code !~ '^LVT-' then
    v_code := 'LVT-' || v_code;
  end if;

  select * into v_row from public.enrolments where claim_code = v_code and status <> 'cancelled';
  if not found then
    insert into public.claim_attempts (user_id) values (me);
    return jsonb_build_object('ok', false, 'error', 'That code does not match an enrolment. Check it against the message we sent you.');
  end if;

  select c.slug into v_slug from public.courses c where c.id = v_row.course_id;

  if v_row.user_id = me then
    return jsonb_build_object('ok', true, 'already', true, 'course_slug', v_slug);
  end if;

  if v_row.user_id is not null then
    insert into public.claim_attempts (user_id) values (me);
    return jsonb_build_object('ok', false, 'error', 'That code has already been used by another account. Contact us if this enrolment is yours.');
  end if;

  if exists (select 1 from public.enrolments
              where user_id = me and batch_id = v_row.batch_id and status <> 'cancelled' and id <> v_row.id) then
    return jsonb_build_object('ok', false, 'error', 'This account is already enrolled in that batch.');
  end if;

  update public.enrolments set user_id = me, linked_at = now() where id = v_row.id;
  return jsonb_build_object('ok', true, 'course_slug', v_slug);
end;
$$;

revoke all on function public.claim_enrolment(text) from public, anon;
grant execute on function public.claim_enrolment(text) to authenticated;

-- ---------------------------------------------------------- course access

-- Everything the LMS needs to show one course to the signed-in learner, in
-- one call: their enrolment and batch, the batch's sessions, the module list,
-- which modules are open, and the next session. Null when they have no
-- enrolment on the course.
--
-- Zoom details and open modules are included only once payment is marked
-- paid. A pending enrolment sees its dates and its payment link, nothing more.
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
               'join_url',      case when v_is_paid then nullif(l.join_url, '') end,
               'meeting_id',    case when v_is_paid then nullif(l.meeting_id, '') end,
               'passcode',      case when v_is_paid then nullif(l.passcode, '') end,
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

-- Seats still free on a batch, for the checkout to refuse a full one before
-- taking money. Counts everyone's enrolments, which no caller can read.
create or replace function public.batch_seats_left(p_batch uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select greatest(b.seats - coalesce((
           select sum(e.seats) from public.enrolments e
            where e.batch_id = b.id and e.status <> 'cancelled'), 0), 0)::integer
    from public.batches b
   where b.id = p_batch;
$$;

grant execute on function public.batch_seats_left(uuid) to anon, authenticated;

-- ------------------------------------------------------- verified payments

-- 0014's capacity check, with one exception: a payment Razorpay has already
-- taken is recorded even if the batch filled in the minutes it took. Refusing
-- it would lose the record of someone who has paid. Only
-- record_paid_enrolment sets the flag, for the length of its own transaction.
create or replace function public.check_batch_capacity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  cap  integer;
  sold integer;
begin
  if new.status = 'cancelled' or current_setting('lvt.skip_capacity', true) = 'on' then
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

-- Records a payment the payment server has verified with Razorpay. Callable
-- only with the service key — never from a browser.
--
-- Idempotent on the payment id: the verify step and Razorpay's webhook can
-- both report the same payment, and it becomes one enrolment. Where the buyer
-- already holds an enrolment on the batch — their own, or one an admin made
-- under the same email and they then paid for online — that row is marked
-- paid instead of a second being added.
create or replace function public.record_paid_enrolment(p jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_payment text := nullif(trim(p->>'payment_id'), '');
  v_batch   uuid := nullif(p->>'batch_id', '')::uuid;
  v_user    uuid := nullif(p->>'user_id', '')::uuid;
  v_email   text := lower(trim(coalesce(p->>'email', '')));
  v_amount  integer := nullif(p->>'amount_paise', '')::integer;
  v_id      uuid;
begin
  if v_payment is null or v_batch is null then
    raise exception 'payment_id and batch_id are required';
  end if;

  select id into v_id from public.enrolments where razorpay_payment_id = v_payment;
  if v_id is not null then
    -- Already recorded — by the webhook, say, before verify issued the
    -- invoice. Fill in the invoice number if this report carries one.
    update public.enrolments
       set invoice_no = p->>'invoice_no'
     where id = v_id and invoice_no = '' and coalesce(p->>'invoice_no', '') <> '';
    return v_id;
  end if;

  perform set_config('lvt.skip_capacity', 'on', true);

  select id into v_id
    from public.enrolments
   where batch_id = v_batch
     and status <> 'cancelled'
     and ((v_user is not null and user_id = v_user) or (v_email <> '' and email = v_email and user_id is null))
   order by (user_id is not null) desc, created_at
   limit 1;

  if v_id is not null then
    update public.enrolments
       set status = 'paid',
           method = 'razorpay',
           user_id = coalesce(user_id, v_user),
           linked_at = case when user_id is null and v_user is not null then now() else linked_at end,
           amount_paise = coalesce(v_amount, amount_paise),
           razorpay_order_id = coalesce(p->>'order_id', ''),
           razorpay_payment_id = v_payment,
           invoice_no = coalesce(p->>'invoice_no', '')
     where id = v_id;
    return v_id;
  end if;

  insert into public.enrolments (
    batch_id, course_id, user_id, linked_at, name, email, phone, source, method, status,
    amount_paise, seats, razorpay_order_id, razorpay_payment_id, invoice_no
  ) values (
    v_batch,
    (select course_id from public.batches where id = v_batch),
    v_user,
    case when v_user is not null then now() end,
    coalesce(nullif(trim(p->>'name'), ''), nullif(v_email, ''), 'Online buyer'),
    v_email,
    coalesce(p->>'phone', ''),
    'Website', 'razorpay', 'paid',
    coalesce(v_amount, 0), 1,
    coalesce(p->>'order_id', ''), v_payment, coalesce(p->>'invoice_no', '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_paid_enrolment(jsonb) from public, anon, authenticated;
grant execute on function public.record_paid_enrolment(jsonb) to service_role;
