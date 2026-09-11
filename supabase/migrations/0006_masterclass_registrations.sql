-- Masterclass registrations join the enquiries list.
--
-- The PoSH 2026 masterclass page takes payment on the spot. Once Razorpay has
-- confirmed a payment, the page writes the registration here as well, so the
-- office can filter and export attendees beside everything else.
--
-- A row is a note of a registration, not proof of one. The table takes anon
-- inserts, so anyone could write a "masterclass" row by hand; the payment id
-- in its message is what to check against the Razorpay dashboard, which is the
-- record of who actually paid.

alter table public.enquiries drop constraint if exists enquiries_form_check;
alter table public.enquiries
  add constraint enquiries_form_check
  check (form in ('popup', 'contact', 'service', 'kit', 'masterclass', 'other'));
