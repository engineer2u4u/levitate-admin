-- Delete the 23 scripted test accounts left over from building the LMS.
--
-- Run in the Supabase SQL editor. This cannot be undone: deleting an account
-- takes its profile and any progress with it.
--
-- Every address is listed in full rather than matched by pattern, so the
-- scope is exactly what you can read here — no wildcard can widen it later.
-- The three real accounts are not in the list:
--   rudantrades@gmail.com (admin), engineer2u4u@gmail.com, deep.deepak30@gmail.com
--
-- The guards below refuse anything holding a seat or carrying a portal role,
-- so even an editing slip cannot take out a real learner.

-- What will go. Read this first.
with doomed(email) as (values
  ('w1788979810962@example.com'),
  ('w1788979769635@example.com'),
  ('w1788979691277@example.com'),
  ('w1788979566737@example.com'),
  ('a1788979181372@example.com'),
  ('a1788979140424@example.com'),
  ('c1788976205310@example.com'),
  ('levitate.card.1788518392307@mailinator.com'),
  ('levitate.rz.1788517778071@mailinator.com'),
  ('levitate.free.1788440894897@mailinator.com'),
  ('levitate.pay.1788341972325@mailinator.com'),
  ('levitate.pay.1788341908692@mailinator.com'),
  ('levitate.pay.1788341842622@mailinator.com'),
  ('levitate.isolation.1788340562@mailinator.com'),
  ('levitate.flowtest.1788340455165@mailinator.com'),
  ('levitate.flowtest.1788338810401@mailinator.com'),
  ('levitate.flowtest.1788293870230@mailinator.com'),
  ('levitate.flowtest.1788293785360@mailinator.com'),
  ('levitate.flowtest.1788292974408@mailinator.com'),
  ('levitate.flowtest.1788292411757@mailinator.com'),
  ('levitate.flowtest.1788291155428@mailinator.com'),
  ('levitate.flowtest.1788284286419@mailinator.com'),
  ('levitate.flowtest.1788284223454@mailinator.com')
)
select u.email,
       u.created_at::date as signed_up,
       coalesce(p.role, 'learner') as role,
       (select count(*) from public.enrolments e
         where e.user_id = u.id or lower(e.email) = lower(u.email)) as seats
  from auth.users u
  join doomed d on lower(u.email) = d.email
  left join public.profiles p on p.id = u.id
 order by u.created_at desc;

-- Then the delete. Same list, with the guards applied.
with doomed(email) as (values
  ('w1788979810962@example.com'),
  ('w1788979769635@example.com'),
  ('w1788979691277@example.com'),
  ('w1788979566737@example.com'),
  ('a1788979181372@example.com'),
  ('a1788979140424@example.com'),
  ('c1788976205310@example.com'),
  ('levitate.card.1788518392307@mailinator.com'),
  ('levitate.rz.1788517778071@mailinator.com'),
  ('levitate.free.1788440894897@mailinator.com'),
  ('levitate.pay.1788341972325@mailinator.com'),
  ('levitate.pay.1788341908692@mailinator.com'),
  ('levitate.pay.1788341842622@mailinator.com'),
  ('levitate.isolation.1788340562@mailinator.com'),
  ('levitate.flowtest.1788340455165@mailinator.com'),
  ('levitate.flowtest.1788338810401@mailinator.com'),
  ('levitate.flowtest.1788293870230@mailinator.com'),
  ('levitate.flowtest.1788293785360@mailinator.com'),
  ('levitate.flowtest.1788292974408@mailinator.com'),
  ('levitate.flowtest.1788292411757@mailinator.com'),
  ('levitate.flowtest.1788291155428@mailinator.com'),
  ('levitate.flowtest.1788284286419@mailinator.com'),
  ('levitate.flowtest.1788284223454@mailinator.com')
)
delete from auth.users u
 using doomed d
 where lower(u.email) = d.email
   -- Throwaway domains only, whatever the list says.
   and split_part(lower(u.email), '@', 2) in ('example.com', 'mailinator.com')
   -- Never someone holding a seat.
   and not exists (select 1 from public.enrolments e
                    where e.user_id = u.id or lower(e.email) = lower(u.email))
   -- Never a portal account.
   and not exists (select 1 from public.profiles p
                    where p.id = u.id and p.role <> 'learner')
 returning u.email;

-- What is left. Should be your three real accounts.
select u.email, coalesce(p.role, 'learner') as role, u.created_at::date as signed_up
  from auth.users u
  left join public.profiles p on p.id = u.id
 order by u.created_at;
