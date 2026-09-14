-- Removes the demo course.
--
-- 0009 seeded "Demo · Workplace Facilitation Essentials" as a fixture for
-- exercising the learning flow — sequential unlocking, progress tracking, the
-- reading kit — published so a testing build could buy it and hidden so no
-- visitor would see it. It filled a card on the admin's Courses screen for
-- everyone else, and the catalogue is now the real one.
--
-- This deletes test records along with it, and nothing else:
--   · enrolments on it     — simulated payments (it charged ₹1,000 in test
--                            mode); the enrolments FK is `on delete restrict`,
--                            so the course cannot go while they exist
--   · its sessions         — cascade from the course
--   · progress rows on it  — keyed by slug rather than a foreign key, so they
--                            would otherwise be left orphaned
--
-- Everything is scoped to the one slug. Re-runnable: after the first run there
-- is nothing left to match.
--
-- To restore it, re-run the demo row from 0009 — 0009's own insert is
-- `on conflict (slug) do nothing`, so it will not come back on its own.

delete from public.enrolments
 where course_id in (select id from public.courses where slug = 'demo-course');

delete from public.course_progress
 where course_slug = 'demo-course';

-- Its sessions go with it: sessions.course_id is `on delete cascade`.
delete from public.courses
 where slug = 'demo-course';
