-- Reset PoSH progress for deep.deepak30@gmail.com, back to nothing read.
--
-- Run in the Supabase SQL editor. Safe to re-run — it wipes progress each
-- time, which is the point.
--
-- What it clears: every completed lesson, every quiz attempt, and the
-- completion stamp on the enrolment. What it keeps: the enrolment itself,
-- the seat, and which modules the batch has unlocked — so the account can
-- walk the same course again from the top.

do $$
declare
  v_email text := 'deep.deepak30@gmail.com';
  v_slug  text := 'posh-trainer';
  v_user  uuid;
  v_gone  integer;
begin
  select id into v_user from auth.users where lower(email) = v_email;

  if v_user is null then
    raise exception 'No account for % — nothing to reset.', v_email;
  end if;

  delete from public.course_progress
   where user_id = v_user and course_slug = v_slug;
  get diagnostics v_gone = row_count;

  -- A learner who had finished should not still read as finished.
  update public.enrolments e
     set completed_at        = null,
         certificate_sent_at = null,
         toolkit_sent_at     = null
    from public.courses c
   where c.id = e.course_id
     and c.slug = v_slug
     and (e.user_id = v_user or lower(e.email) = v_email);

  raise notice 'Cleared % progress row(s) for % on %.', v_gone, v_email, v_slug;
end;
$$;

-- Confirm there is nothing left.
select p.course_slug, cardinality(p.completed_items) as items_done, p.completed_at
  from public.course_progress p
  join auth.users u on u.id = p.user_id
 where lower(u.email) = 'deep.deepak30@gmail.com';
