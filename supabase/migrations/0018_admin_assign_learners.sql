-- Levitate LMS — assign a signed-up account to a batch by hand
--
-- For testing the learner side without money moving: an admin picks an
-- existing account and gives it paid access to any batch, then takes it away
-- again. The same two functions are what a genuine comp or replacement seat
-- goes through, so this is not a back door bolted on beside the real path —
-- it is the real path with the payment step skipped and recorded as such.
--
-- What keeps it honest:
--   * admin only (`is_admin()`), never a viewer, never a learner;
--   * the enrolment is stamped `method = 'offline'` and `source = 'Admin'`,
--     so nothing downstream reads it as money received;
--   * unassigning refuses to delete a row that carries a Razorpay payment —
--     that one is cancelled instead, because deleting it would erase the only
--     record that someone paid.
--
-- Re-runnable. Run in the Supabase SQL editor.

-- ------------------------------------------------------------------ assign

create or replace function public.admin_assign_learner(
  p_user_id  uuid,
  p_batch_id uuid
)
returns public.enrolments
language plpgsql
security definer set search_path = public
as $$
declare
  v_name   text;
  v_email  text;
  v_amount integer;
  v_row    public.enrolments;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can assign a learner to a batch.'
      using errcode = '42501';
  end if;

  select coalesce(nullif(trim(p.name), ''), split_part(p.email, '@', 1)),
         lower(trim(p.email))
    into v_name, v_email
    from public.profiles p
   where p.id = p_user_id;

  if v_email is null then
    raise exception 'That account does not exist.'
      using errcode = 'foreign_key_violation';
  end if;

  -- The fee is snapshotted as any enrolment snapshots it, so the roster and
  -- reports read the same shape for an assigned seat as for a bought one.
  select coalesce(c.price_paise, 0)
    into v_amount
    from public.batches b
    join public.courses c on c.id = b.course_id
   where b.id = p_batch_id;

  if v_amount is null then
    raise exception 'That batch does not exist.'
      using errcode = 'foreign_key_violation';
  end if;

  -- A seat handed out by an admin should not be refused because the batch is
  -- notionally full: the admin can see the roster and is deciding anyway.
  perform set_config('lvt.skip_capacity', 'on', true);

  -- Already on this batch under either key? Then this is a re-assign, and the
  -- existing row is brought back rather than a second one created beside it.
  select * into v_row
    from public.enrolments
   where batch_id = p_batch_id
     and (user_id = p_user_id or lower(email) = v_email)
   order by (user_id = p_user_id) desc
   limit 1;

  if v_row.id is not null then
    update public.enrolments
       set status     = 'paid',
           user_id    = p_user_id,
           linked_at  = coalesce(linked_at, now()),
           -- Only ever relaxed for a row that carries no payment of its own,
           -- so a real Razorpay enrolment keeps its own method and source.
           method     = case when razorpay_payment_id is null then 'offline' else method end,
           source     = case when razorpay_payment_id is null then 'Admin' else source end,
           notes      = case
                          when razorpay_payment_id is null and coalesce(notes, '') = ''
                            then 'Assigned by an admin without payment.'
                          else notes
                        end
     where id = v_row.id
     returning * into v_row;
    return v_row;
  end if;

  insert into public.enrolments
    (user_id, name, email, batch_id, status, source, method, amount_paise, linked_at, notes)
  values
    (p_user_id, v_name, v_email, p_batch_id, 'paid', 'Admin', 'offline', v_amount, now(),
     'Assigned by an admin without payment.')
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_assign_learner(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_learner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- unassign

-- Returns what it did: 'deleted' for an assigned seat, 'cancelled' for one
-- that carries a payment, so the caller can say so rather than guess.
create or replace function public.admin_unassign_learner(p_enrolment_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.enrolments;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove a learner from a batch.'
      using errcode = '42501';
  end if;

  select * into v_row from public.enrolments where id = p_enrolment_id;
  if v_row.id is null then
    raise exception 'That enrolment does not exist.'
      using errcode = 'no_data_found';
  end if;

  -- Money arrived for this one. Cancelling keeps the record and frees the
  -- seat; deleting it would destroy the only proof of the sale.
  if v_row.razorpay_payment_id is not null then
    update public.enrolments set status = 'cancelled' where id = p_enrolment_id;
    return 'cancelled';
  end if;

  delete from public.enrolments where id = p_enrolment_id;
  return 'deleted';
end;
$$;

revoke all on function public.admin_unassign_learner(uuid) from public, anon;
grant execute on function public.admin_unassign_learner(uuid) to authenticated;

-- ----------------------------------------------------------- reset progress

-- Learner progress belongs to the account, not the enrolment, so a learner
-- re-assigned to the same batch carries on where they left off. Clearing it is
-- therefore a separate, deliberate act — for walking a course again from the
-- top while testing, or for someone repeating a batch.
--
-- Returns how many lessons were cleared, so the caller can say so.
create or replace function public.admin_reset_progress(
  p_user_id     uuid,
  p_course_slug text
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_items integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reset a learner''s progress.'
      using errcode = '42501';
  end if;

  select coalesce(cardinality(completed_items), 0)
    into v_items
    from public.course_progress
   where user_id = p_user_id and course_slug = p_course_slug;

  delete from public.course_progress
   where user_id = p_user_id and course_slug = p_course_slug;

  -- Someone who had finished must not still read as finished, or the roster
  -- and any certificate check disagree with the empty progress row.
  update public.enrolments e
     set completed_at        = null,
         certificate_sent_at = null,
         toolkit_sent_at     = null
    from public.courses c
   where c.id = e.course_id
     and c.slug = p_course_slug
     and e.user_id = p_user_id;

  return coalesce(v_items, 0);
end;
$$;

revoke all on function public.admin_reset_progress(uuid, text) from public, anon;
grant execute on function public.admin_reset_progress(uuid, text) to authenticated;

notify pgrst, 'reload schema';
