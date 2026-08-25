-- Levitate LMS — admin access by invitation
--
-- Replaces self-service sign-up for the admin portal. Nobody grants themselves
-- the portal: an existing admin writes an invite row, the invitee follows the
-- emailed link, and the role attaches to their account on arrival.
--
-- Two portal roles:
--   admin  — full read/write on the catalogue and on who else has access
--   viewer — read-only; every write policy below refuses them
--
-- `learner` stays what it has always been: an account on the public site with
-- no portal access at all. Re-runnable, like 0001.

-- ------------------------------------------------------------------ roles

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('learner', 'viewer', 'admin'));

-- The Users screen has to print an address next to a role, and auth.users is
-- not reachable with the anon key. Mirror it here, kept in step by the two
-- triggers below rather than by anything the browser sends.
alter table public.profiles add column if not exists email text not null default '';
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email = '';

-- Portal access, as opposed to `is_admin()` which is permission to change
-- things. Every read policy an admin has, a viewer has too.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'viewer')
  );
$$;

-- ---------------------------------------------------------------- invites

create table if not exists public.admin_invites (
  id          uuid primary key default gen_random_uuid(),
  -- Always stored lowercase (see the trigger) so the lookup on acceptance is
  -- an equality test, and `Ravi@` cannot shadow `ravi@`.
  email       text not null unique,
  name        text not null default '',
  role        text not null default 'viewer' check (role in ('viewer', 'admin')),
  invited_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users on delete set null
);

create or replace function public.normalize_invite_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists admin_invites_normalize on public.admin_invites;
create trigger admin_invites_normalize
  before insert or update of email on public.admin_invites
  for each row execute function public.normalize_invite_email();

-- ---------------------------------------------------- attaching an invite

-- Applies a pending invite to an account. SECURITY DEFINER because it writes a
-- role, so execute is revoked below from everyone: taking a uuid and an email
-- as arguments, it would otherwise be a way to hand yourself somebody else's
-- invite. Only the two callers underneath may reach it.
create or replace function public.apply_admin_invite(target uuid, mail text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.admin_invites;
begin
  if mail is null or trim(mail) = '' then
    return null;
  end if;

  select * into inv
    from public.admin_invites
   where email = lower(trim(mail))
     and accepted_at is null;

  if not found then
    return null;
  end if;

  update public.profiles
     set role = inv.role,
         -- Only fill a name in; never overwrite one the person has set.
         name = case when trim(name) = '' then inv.name else name end
   where id = target;

  update public.admin_invites
     set accepted_at = now(), accepted_by = target
   where id = inv.id;

  return inv.role;
end;
$$;

revoke all on function public.apply_admin_invite(uuid, text) from public, anon, authenticated;

-- Every new account still gets a profile; it now also picks up an invite if
-- one is waiting on that address.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, org, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'org', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do update set email = excluded.email;

  perform public.apply_admin_invite(new.id, new.email);
  return new;
end;
$$;

-- Keep the mirrored address current if someone changes theirs.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- The trigger above only covers accounts created *after* the invite. Somebody
-- who already had a learner account claims theirs here instead, on their next
-- sign-in. Safe to expose: it reads the caller's own id and their real address
-- from auth.users, so neither can be spoofed by the browser.
create or replace function public.claim_admin_invite()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  mail text;
begin
  if uid is null then
    return null;
  end if;
  select email into mail from auth.users where id = uid;
  perform public.apply_admin_invite(uid, mail);
  return (select role from public.profiles where id = uid);
end;
$$;

grant execute on function public.claim_admin_invite() to authenticated;

-- ------------------------------------------------------- changing a role

-- `profiles_self_write` from 0001 lets you update your own row, which as
-- written includes its `role` column — an account could promote itself to
-- admin with one API call, and no policy would stop it.
--
-- The fix is a privilege, not a policy: narrow UPDATE to the two fields that
-- are genuinely yours to edit. `role` and `email` then have no writer at all
-- among the browser-facing roles. The SECURITY DEFINER functions here still
-- write them because they run as the table owner, which is the whole point —
-- a role changes through `set_admin_role` or an invite, or not at all.
revoke update on public.profiles from anon, authenticated;
grant update (name, org) on public.profiles to authenticated;

-- Superseded by the grant above; dropped so re-running an older copy of this
-- file cannot leave it behind. It refused any role change by a non-admin,
-- which also blocked an invitee accepting their own invite.
drop trigger if exists profiles_guard_role on public.profiles;
drop function if exists public.guard_profile_role();

create or replace function public.set_admin_role(target uuid, new_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  if new_role not in ('learner', 'viewer', 'admin') then
    raise exception 'Unknown role %', new_role using errcode = '22023';
  end if;
  -- Demoting yourself is how a project ends up with no admin at all and no way
  -- back except the SQL editor. Another admin can always do it for you.
  if target = auth.uid() and new_role <> 'admin' then
    raise exception 'You cannot change your own access' using errcode = '42501';
  end if;

  update public.profiles set role = new_role where id = target;
end;
$$;

grant execute on function public.set_admin_role(uuid, text) to authenticated;

-- ------------------------------------------------------------------- RLS

alter table public.admin_invites enable row level security;
grant select, insert, update, delete on public.admin_invites to authenticated;

-- A viewer can see who has been invited; only an admin can invite or revoke.
drop policy if exists admin_invites_staff_read on public.admin_invites;
create policy admin_invites_staff_read on public.admin_invites
  for select using (public.is_staff());

drop policy if exists admin_invites_admin_write on public.admin_invites;
create policy admin_invites_admin_write on public.admin_invites
  for all using (public.is_admin()) with check (public.is_admin());

-- Reads widen to staff; writes stay admin-only, which is the whole of what
-- "viewer" means. The write policies from 0001 are left exactly as they are.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists courses_public_read on public.courses;
create policy courses_public_read on public.courses
  for select using (status = 'live' or public.is_staff());

drop policy if exists sessions_public_read on public.sessions;
create policy sessions_public_read on public.sessions
  for select using (
    public.is_staff()
    or (status <> 'draft' and exists (
      select 1 from public.courses c where c.id = course_id and c.status = 'live'
    ))
  );

drop policy if exists enrolments_own_read on public.enrolments;
create policy enrolments_own_read on public.enrolments
  for select using (user_id = auth.uid() or public.is_staff());

-- --------------------------------------------------------- the first admin
--
-- Chicken and egg: only an admin can invite, so the first one is made by hand.
-- Sign in to the portal once (the account is created, with no access), then:
--
--   update public.profiles set role = 'admin' where id = (
--     select id from auth.users where email = 'you@levitatepeoplesoft.com'
--   );
--
-- Everyone after that is invited from Users inside the app.
