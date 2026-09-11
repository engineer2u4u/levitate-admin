-- Website enquiries.
--
-- Every enquiry form on the site — the pop-up, the contact page, the service
-- pages, the landing-page kit form — used to go out only as an EmailJS email.
-- That left no record anyone could search, filter or export, and an email that
-- failed to arrive was an enquiry lost without trace. The site now writes each
-- one here as well, and the admin reads it back.
--
-- The site is a static export holding only the anon key, so the table accepts
-- inserts from anyone and reads from admins only. That is the ordinary shape
-- for a public form: the key is public, and RLS is what keeps the contents
-- private.

create table if not exists public.enquiries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- Which form it came from, so the admin can filter the pop-up from the
  -- contact page. Constrained, not free text, so a filter always matches.
  form         text not null default 'other'
               check (form in ('popup', 'contact', 'service', 'kit', 'other')),

  -- Bounded, because this table takes writes from the open internet. The
  -- limits sit well above anything a real enquiry needs and well below what
  -- would make a row a problem to store or display.
  name         text not null check (char_length(name) between 1 and 200),
  email        text not null check (char_length(email) between 3 and 320),
  phone        text not null default '' check (char_length(phone) <= 40),
  organization text not null default '' check (char_length(organization) <= 200),
  intent       text not null default '' check (char_length(intent) <= 300),
  participants text not null default '' check (char_length(participants) <= 60),
  mode         text not null default '' check (char_length(mode) <= 60),
  message      text not null default '' check (char_length(message) <= 5000),
  -- The page the form was submitted from.
  page         text not null default '' check (char_length(page) <= 300)
);

create index if not exists enquiries_created_idx on public.enquiries (created_at desc);
create index if not exists enquiries_form_idx on public.enquiries (form);

-- The client could otherwise send its own created_at and backdate a row, or
-- float one to the top of the list. The server's clock is the only one that
-- counts.
create or replace function public.stamp_enquiry()
returns trigger
language plpgsql
as $$
begin
  new.created_at = now();
  return new;
end;
$$;

drop trigger if exists enquiries_stamp on public.enquiries;
create trigger enquiries_stamp
  before insert on public.enquiries
  for each row execute function public.stamp_enquiry();

-- ------------------------------------------------------------------- RLS

alter table public.enquiries enable row level security;

-- Anyone may submit. Not select: the site inserts with return=minimal, so it
-- never needs to read a row back — and a visitor must not be able to read
-- anybody else's enquiry, their own included, through the public key.
drop policy if exists enquiries_public_insert on public.enquiries;
create policy enquiries_public_insert on public.enquiries
  for insert to anon, authenticated
  with check (true);

-- Only admins read.
drop policy if exists enquiries_admin_read on public.enquiries;
create policy enquiries_admin_read on public.enquiries
  for select using (public.is_admin());

-- Only admins remove — spam will arrive, and someone needs to be able to clear it.
drop policy if exists enquiries_admin_delete on public.enquiries;
create policy enquiries_admin_delete on public.enquiries
  for delete using (public.is_admin());

grant insert on public.enquiries to anon, authenticated;
grant select, delete on public.enquiries to authenticated;
