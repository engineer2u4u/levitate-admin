-- Levitate LMS — delegate feedback is kept, not just emailed
--
-- The feedback form at the end of the course went out as an email and was
-- stored nowhere, on the reasoning that it is not an enquiry and would be
-- noise in a list of people asking about programmes. The reasoning held for
-- the acknowledgement, which is a signature; it does not hold for feedback,
-- which is the one record of what a cohort thought and is worth reading across
-- batches a year later. An inbox is not where that lives.
--
-- It goes in `enquiries` under its own form name rather than in a table of its
-- own: same shape, same row level security, and the admin already lists them.
-- The name is what keeps it out of the leads — the screen filters on it.
--
-- Re-runnable. Run in the Supabase SQL editor.

alter table public.enquiries drop constraint if exists enquiries_form_check;
alter table public.enquiries
  add constraint enquiries_form_check
  check (form in ('popup', 'contact', 'service', 'kit', 'masterclass', 'feedback', 'other'));

notify pgrst, 'reload schema';

-- What has come in, by form.
select form, count(*) as rows, max(created_at) as latest
  from public.enquiries
 group by form
 order by rows desc;
