-- Levitate LMS — removing a seat that has a certificate against it
--
-- `certificates.enrolment_id` references enrolments on delete restrict, so a
-- seat that has been certified cannot be deleted. That is right: deleting it
-- would destroy the only record of why the certificate was issued. But
-- admin_unassign_learner tried to delete anyway, and the caller got a raw
-- foreign key violation — "something in the database still points at it" —
-- which says nothing anyone can act on.
--
-- A certified seat is now cancelled rather than deleted, exactly as a paid one
-- is, and the function says which of the two happened so the screen can
-- explain itself.
--
-- Re-runnable. Run in the Supabase SQL editor.

create or replace function public.admin_unassign_learner(p_enrolment_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_row  public.enrolments;
  v_cert text;
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

  -- A certificate was issued against this seat. Cancelling frees it and keeps
  -- the register's reason for the certificate intact.
  select cert_no into v_cert
    from public.certificates
   where enrolment_id = p_enrolment_id and revoked_at is null
   limit 1;

  if v_cert is not null then
    update public.enrolments set status = 'cancelled' where id = p_enrolment_id;
    return 'certificate:' || v_cert;
  end if;

  -- Money arrived for this one. Same reasoning: the seat frees, the record of
  -- the sale stays.
  if v_row.razorpay_payment_id is not null then
    update public.enrolments set status = 'cancelled' where id = p_enrolment_id;
    return 'payment';
  end if;

  -- A revoked certificate is history, not a reason to keep the seat: clear it
  -- first so the delete below is not refused by the reference.
  delete from public.certificates where enrolment_id = p_enrolment_id;
  delete from public.enrolments where id = p_enrolment_id;
  return 'deleted';
end;
$$;

revoke all on function public.admin_unassign_learner(uuid) from public, anon;
grant execute on function public.admin_unassign_learner(uuid) to authenticated;

notify pgrst, 'reload schema';
