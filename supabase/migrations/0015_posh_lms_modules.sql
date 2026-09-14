-- PoSH's module list becomes the one learners actually unlock.
--
-- 0011 seeded the 15 titles the website's syllabus publishes. The learning
-- content on the LMS is written as 13 modules, with different boundaries, and
-- unlocking a module after a live session needs one list both sides agree on.
-- It was decided to use the LMS's 13, since those are the ones with videos,
-- readings and the assessment behind them.
--
-- Each module carries:
--   · the id the LMS content uses (Levitate/src/lib/lms/poshContent.ts), so an
--     unlock recorded against it opens the right lessons;
--   · `itemIds`, the lessons inside it, so the admin can show each learner's
--     progress module by module and the database can check completion;
--   · `release`: "enrolment" opens with the enrolment itself, "manual" waits
--     for an admin to unlock it after a live session.
--
-- The lesson text stays in the website's code. What is stored here is only
-- ids and titles, so nothing in `modules` needs hiding.
--
-- `modules_label` ("15 modules") is deliberately left alone: it is the
-- published syllabus, marketing copy, and not a count of these.
--
-- Only replaces 0011's seed (ids beginning "m_posh-trainer_") or an empty
-- list, so a list someone has since edited is never overwritten.
--
-- If poshContent.ts gains, loses or renames a module or lesson, this list
-- has to change with it — in a new migration.

update public.courses
   set modules = $j$[
     {"id": "orientation",       "title": "Orientation and Pre-read",                     "release": "enrolment", "itemIds": ["p-orientation-agreement", "p-orientation-dignity"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "clear-framework",   "title": "The CLEAR PoSH Framework",                     "release": "manual",    "itemIds": ["p-clear-framework"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "genesis",           "title": "Genesis and Legal Foundation",                 "release": "manual",    "itemIds": ["p-genesis-film"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "recognising",       "title": "Recognising Sexual Harassment",                "release": "manual",    "itemIds": ["p-recognising-guide", "p-recognising-apply", "p-recognising-v1", "p-recognising-v2", "p-recognising-v3", "p-recognising-v4"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "coverage",          "title": "Coverage, Definitions and Jurisdiction",       "release": "manual",    "itemIds": ["p-coverage-guide"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "prevention",        "title": "Prevention and Internal Committee Governance", "release": "manual",    "itemIds": ["p-ic-checklist"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "inquiry",           "title": "Complaint Intake and Fair Inquiry",            "release": "manual",    "itemIds": ["p-intake-guide", "p-report-checklist"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "additional-videos", "title": "Additional Videos",                            "release": "manual",    "itemIds": ["p-extra-v1", "p-extra-v2"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "case-laboratory",   "title": "Case Laboratory",                              "release": "manual",    "itemIds": ["p-case-lab"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "toolkit",           "title": "Trainer Toolkit",                              "release": "manual",    "itemIds": ["p-toolkit"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "assessment",        "title": "Final Assessment",                             "release": "manual",    "itemIds": ["p-final-assessment"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "feedback",          "title": "Delegate Feedback",                            "release": "manual",    "itemIds": ["p-feedback"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null},
     {"id": "certificate",       "title": "Your Certificate",                             "release": "manual",    "itemIds": ["p-certificate"], "summary": "", "imageUrl": "", "lessons": [], "quiz": null}
   ]$j$::jsonb
 where slug = 'posh-trainer'
   and (
     jsonb_array_length(coalesce(modules, '[]'::jsonb)) = 0
     or not exists (
       select 1 from jsonb_array_elements(modules) m
        where coalesce(m->>'id', '') not like 'm\_posh-trainer\_%'
     )
   );
