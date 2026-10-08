-- Levitate LMS — the DEIB programme is a certification, and says so
--
-- "Certified Diversity, Equity, Inclusion and Belonging Facilitator Program
-- TTT". The word is the point: it is what the programme awards, and the title
-- is what a certificate prints and what the website lists.
--
-- The card the website shows carries its own copy of the title, so that is
-- updated with it — otherwise the catalogue and the course page would disagree
-- about the name of the same thing.
--
-- Re-runnable. Run in the Supabase SQL editor.

update public.courses
   set title = 'Certified Diversity, Equity, Inclusion and Belonging Facilitator Program TTT'
 where slug = 'inclusive-workplace';

-- The Upcoming Batches card keeps its own title; keep the two in step.
update public.courses
   set batch = jsonb_set(batch, '{title}', to_jsonb(title))
 where slug = 'inclusive-workplace'
   and batch ? 'title';

notify pgrst, 'reload schema';

select slug, title, batch ->> 'title' as card_title, short
  from public.courses
 where slug = 'inclusive-workplace';
