-- Enrol deep.deepak30@gmail.com in PoSH TTT — October 2026.
--
-- Run this in the Supabase SQL editor AFTER migration 0018. Re-running it is
-- safe: it brings an existing row back to paid rather than adding a second.
--
-- The SQL editor runs as the database owner, not as your admin account, so
-- this writes the row directly instead of calling admin_assign_learner()
-- (which deliberately refuses anyone who is not a signed-in admin).

do $$
declare
  v_email    text := 'deep.deepak30@gmail.com';
  v_batch    uuid;
  v_price    integer;
  v_user     uuid;
  v_name     text;
  v_existing uuid;
begin
  select b.id, coalesce(c.price_paise, 0)
    into v_batch, v_price
    from public.batches b
    join public.courses c on c.id = b.course_id
   where c.slug = 'posh-trainer' and b.code = '2026-10';

  if v_batch is null then
    raise exception 'No PoSH batch with code 2026-10 — check the batch in the admin.';
  end if;

  -- The account, if they have signed up. No account is fine: the enrolment
  -- waits for them and they claim it with their code when they do sign up.
  select u.id, nullif(trim(p.name), '')
    into v_user, v_name
    from auth.users u
    left join public.profiles p on p.id = u.id
   where lower(u.email) = v_email;

  v_name := coalesce(v_name, split_part(v_email, '@', 1));

  -- A batch that is notionally full should not block a seat given by hand.
  perform set_config('lvt.skip_capacity', 'on', true);

  select id into v_existing
    from public.enrolments
   where batch_id = v_batch
     and (lower(email) = v_email or (v_user is not null and user_id = v_user))
   limit 1;

  if v_existing is not null then
    update public.enrolments
       set status    = 'paid',
           user_id   = coalesce(v_user, user_id),
           linked_at = case when v_user is null then linked_at else coalesce(linked_at, now()) end
     where id = v_existing;
    raise notice 'Existing enrolment % set to paid.', v_existing;
  else
    insert into public.enrolments
      (user_id, name, email, batch_id, status, source, method, amount_paise, linked_at, notes)
    values
      (v_user, v_name, v_email, v_batch, 'paid', 'Admin', 'offline', v_price,
       case when v_user is null then null else now() end,
       'Assigned by an admin without payment.');
    raise notice 'Enrolled % in the PoSH October 2026 batch.', v_email;
  end if;

  if v_user is null then
    raise notice 'No LMS account for % yet — they sign up with this email and claim it with the code on the roster.', v_email;
  end if;
end;
$$;

-- What the roster will now show.
select e.name, e.email, e.status, e.claim_code, e.user_id is not null as signed_up, b.name as batch
  from public.enrolments e
  join public.batches b on b.id = e.batch_id
  join public.courses c on c.id = e.course_id
 where c.slug = 'posh-trainer'
 order by e.created_at desc;
