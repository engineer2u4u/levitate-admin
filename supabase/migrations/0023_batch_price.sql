-- Levitate LMS — every batch carries its own price
--
-- The fee lived on the course, which is wrong in two ways. A course's price
-- changes between runs — an early-bird October and a full-price November are
-- the same course — and several courses carry 0 in the database today while
-- the website quotes a real fee, so "Course fee ₹0" is what the enrol form
-- offers to charge. A batch is the thing people actually buy, so the price
-- belongs on the batch.
--
-- Money is integer paise here as everywhere else: never numeric, never float,
-- so a fee cannot drift by a rounding error.
--
-- Re-runnable. Run in the Supabase SQL editor.

alter table public.batches
  add column if not exists price_paise integer not null default 0
    check (price_paise >= 0);

-- Existing batches inherit what their course charged, so nothing starts at
-- zero that was not zero already.
update public.batches b
   set price_paise = coalesce(c.price_paise, 0)
  from public.courses c
 where c.id = b.course_id
   and b.price_paise = 0;

-- A new batch starts from its course's price rather than from nothing. It can
-- be changed on the batch afterwards; this only saves retyping the usual case.
create or replace function public.batches_default_price()
returns trigger
language plpgsql
as $$
begin
  if new.price_paise = 0 then
    select coalesce(c.price_paise, 0) into new.price_paise
      from public.courses c where c.id = new.course_id;
  end if;
  return new;
end;
$$;

drop trigger if exists batches_default_price on public.batches;
create trigger batches_default_price
  before insert on public.batches
  for each row execute function public.batches_default_price();

-- The website reads batches as anon for its dates; the price is public too —
-- it is on the course page already — so this joins the columns anon may read.
grant select (price_paise) on public.batches to anon;

notify pgrst, 'reload schema';

-- What each batch now charges.
select c.slug, b.name, b.price_paise, (b.price_paise / 100.0) as rupees
  from public.batches b
  join public.courses c on c.id = b.course_id
 order by c.slug, b.starts_on;
