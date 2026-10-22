-- Levitate LMS — POCSO's modules, as the course player holds them
--
-- The POCSO course carried eight syllabus modules with no item lists: the
-- shape of the programme, not of the learner's journey. The website now has
-- authored content for it (`pocsoContent.ts`), so this column becomes what it
-- already is for PoSH — the player's modules, with the item ids the database
-- is the authority on.
--
-- What that column drives, and therefore what this fixes:
--   * `issue_certificate` requires every id in `modules[].itemIds`. With none
--     listed it refuses outright — "this course has no lesson list yet" — so
--     no POCSO certificate could be issued at all.
--   * the admin's progress figures count out of these ids, which is why a
--     POCSO learner read as "0 of ?".
--   * `release` decides what opens when: `enrolment` is open from the moment a
--     seat is paid, `manual` waits for the office to unlock it for the batch
--     after the live session it belongs to.
--
-- Deploy the website FIRST. An id listed here that the content does not render
-- can never be completed, which stalls every certificate on the course; an id
-- the content renders but this does not list is merely uncounted. Same
-- direction as 0031, and the opposite of a removal.
--
-- The eight syllabus titles this replaces are kept here so nothing is lost to
-- the change — the public programme page does not read this column (it takes
-- its outline from `programOutlines.ts` in the website's code) and the
-- catalogue selects only `modules_label`, so no visitor-facing page moves:
--
--   01 Foundations of POCSO & the Levitate GUARD Child Safety Framework™
--   02 Ground Rules for Safe & Sensitive Facilitation
--   03 Understanding POCSO: Law, Offences & Child Protection Ecosystem
--   04 Age-Appropriate Child Safety Communication
--   05 Recognising Signals, Grooming & Vulnerability
--   06 Disclosure, Response & Responsible Reporting
--   07 Prevention & Institutional Child-Safety Systems
--   08 POCSO Trainer Mastery & Certification Practicum
--
-- Re-runnable: it writes the list rather than adding to it.

update public.courses
   set modules = jsonb_build_array(
     jsonb_build_object(
       'id', 'orientation',
       'title', 'Orientation',
       'summary', 'Watch before the first live session, then sign the agreement.',
       -- Open as soon as the seat is paid: the agreement has to be signed
       -- before anyone walks into the first session, not after it.
       'release', 'enrolment',
       'itemIds', jsonb_build_array('pc-orientation-film', 'pc-orientation-agreement'),
       'lessons', '[]'::jsonb,
       'quiz', null
     ),
     jsonb_build_object(
       'id', 'case-laboratory',
       'title', 'Case Laboratory',
       'summary', 'Ten judgments, worked through against the Act.',
       'release', 'manual',
       'itemIds', jsonb_build_array('pc-case-lab', 'pc-case-lab-link'),
       'lessons', '[]'::jsonb,
       'quiz', null
     ),
     jsonb_build_object(
       'id', 'toolkit',
       'title', 'Facilitator Toolkit',
       'summary', 'What you take away to run your own sessions.',
       'release', 'manual',
       'itemIds', jsonb_build_array('pc-toolkit'),
       'lessons', '[]'::jsonb,
       'quiz', null
     )
   )
 where slug = 'pocso-child-safety';

notify pgrst, 'reload schema';

-- What POCSO now requires, and what a certificate will insist on.
select m ->> 'id' as module, m ->> 'release' as release, m -> 'itemIds' as item_ids
  from public.courses c,
       jsonb_array_elements(c.modules) as m
 where c.slug = 'pocso-child-safety';
