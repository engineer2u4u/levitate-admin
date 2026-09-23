-- Every LMS account, with the signals that tell a real learner from junk.
--
-- Run in the Supabase SQL editor. Read-only — it changes nothing.
--
-- How to read it:
--   signed_in_ever = false + confirmed = false  → a signup that never came
--                                                 back. Usually a bot or a
--                                                 half-finished form.
--   provider                                    → 'email' is the website form;
--                                                 'google' etc. means a real
--                                                 identity behind it.
--   seats / lessons_done                        → anyone above zero has done
--                                                 something; never delete
--                                                 these without checking.
--   same_ip_group                               → how many accounts share a
--                                                 signup pattern; a burst from
--                                                 one source lands together.

select
  u.email,
  coalesce(nullif(trim(p.name), ''), '—')                      as name,
  coalesce(nullif(trim(p.org), ''), '—')                       as org,
  p.role,
  u.created_at::date                                           as signed_up,
  (u.email_confirmed_at is not null)                           as confirmed,
  (u.last_sign_in_at is not null)                              as signed_in_ever,
  u.last_sign_in_at::date                                      as last_seen,
  coalesce(
    (select string_agg(distinct i.provider, ',') from auth.identities i where i.user_id = u.id),
    'email'
  )                                                            as provider,
  (select count(*) from public.enrolments e
    where e.user_id = u.id or lower(e.email) = lower(u.email))  as seats,
  coalesce((select sum(cardinality(cp.completed_items))
              from public.course_progress cp where cp.user_id = u.id), 0)
                                                               as lessons_done,
  split_part(u.email, '@', 2)                                  as domain,
  (select count(*) from auth.users u2
    where split_part(u2.email, '@', 2) = split_part(u.email, '@', 2))
                                                               as same_domain_count
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;

-- ------------------------------------------------------------------ summary
-- The shape of the problem in one row, before deciding anything.

select
  count(*)                                                                as accounts,
  count(*) filter (where u.email_confirmed_at is null)                    as unconfirmed,
  count(*) filter (where u.last_sign_in_at is null)                       as never_signed_in,
  count(*) filter (where u.created_at > now() - interval '7 days')        as last_7_days,
  count(distinct split_part(u.email, '@', 2))                             as distinct_domains
from auth.users u;

-- --------------------------------------------------------- safe to remove?
-- Accounts that have signed up and done nothing at all: no seat, no lesson,
-- no sign-in, not staff. This only LISTS them — nothing is deleted. Check the
-- list yourself before removing anyone; deleting an account cascades to its
-- profile and progress.

select u.email, u.created_at::date as signed_up
from auth.users u
left join public.profiles p on p.id = u.id
where u.last_sign_in_at is null
  and coalesce(p.role, 'learner') = 'learner'
  and not exists (select 1 from public.enrolments e
                   where e.user_id = u.id or lower(e.email) = lower(u.email))
  and not exists (select 1 from public.course_progress cp where cp.user_id = u.id)
order by u.created_at desc;
