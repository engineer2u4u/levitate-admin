-- The real syllabus for each course that has one published.
--
-- 0009 seeded the catalogue with every course's copy, fee and dates but left
-- `modules` empty, so a course advertising "15 modules" carried none: the
-- admin's Courses screen counted zero, and the edit form had nothing to list.
-- These are the module titles as levitatepeoplesoft.com publishes them.
--
-- Three courses are deliberately absent — workplace-wellbeing,
-- leadership-facilitator and hr-edge. Their pages say the curriculum "is being
-- finalised" and quote it on request, so there is no real syllabus to seed and
-- an invented one would be worse than none.
--
-- Lessons and quizzes stay empty: a module here is a syllabus line, and the
-- lesson tree is not public (0008 withholds it from the anon role).
--
-- Only fills a course whose module list is still empty, so re-running this
-- can never overwrite what an admin has since edited — like the migrations
-- before it.

with syllabus (slug, titles) as (
  values
    ('posh-trainer', array[
      'Purpose, Culture and the Certification Journey',
      'India''s Evolving PoSH Landscape',
      'The CLEAR PoSH Framework',
      'Genesis and Legal Foundation',
      'Recognising Sexual Harassment',
      'Coverage, Definitions and Jurisdiction',
      'Prevention and Internal Committee Governance',
      'Complaint Intake and Fair Inquiry',
      'Compliance, Governance and Accountability',
      'Digital, Virtual and Evolving Workplace Scenarios',
      'Power Dynamics, Retaliation and Complex Situations',
      'AI × PoSH: Assist, Never Adjudicate',
      'Recent Judicial, Regulatory and Compliance Developments',
      'Applied Case Laboratory',
      'Trainer Craft, Assessment and Certification'
    ]),
    ('pocso-child-safety', array[
      'Foundations of POCSO & the Levitate GUARD Child Safety Framework™',
      'Ground Rules for Safe & Sensitive Facilitation',
      'Understanding POCSO: Law, Offences & Child Protection Ecosystem',
      'Age-Appropriate Child Safety Communication',
      'Recognising Signals, Grooming & Vulnerability',
      'Disclosure, Response & Responsible Reporting',
      'Prevention & Institutional Child-Safety Systems',
      'POCSO Trainer Mastery & Certification Practicum'
    ]),
    ('inclusive-workplace', array[
      'DEI Foundations & the Global Inclusion Landscape',
      'Identity, Intersectionality, Privilege & Power',
      'Bias, Stereotypes & Inclusive Decision-Making',
      'Inclusive Communication, Microaggressions & Constructive Dialogue',
      'Dimensions of Diversity & Intersectional Inclusion',
      'Cultural Intelligence & Working Across Difference',
      'Psychological Safety, Belonging & Inclusive Teams',
      'Allyship, Bystander Intervention & Inclusive Leadership',
      'Inclusive Employee Lifecycle & Organisational DEI',
      'Designing Powerful DEI Learning Experiences',
      'Facilitating Sensitive & Difficult DEI Conversations',
      'Managing Resistance, Hot Moments & Challenging Questions',
      'Case Facilitation, Debriefing & Audience Adaptation'
    ])
),
-- One row per module, numbered, in the shape the admin's course form edits.
built as (
  select
    s.slug,
    jsonb_agg(
      jsonb_build_object(
        -- Stable and legible: "m_posh-trainer_07". The form only ever matches
        -- on it, so it must not change when a title is corrected.
        'id',       'm_' || s.slug || '_' || lpad(m.ord::text, 2, '0'),
        'title',    m.title,
        'summary',  '',
        'imageUrl', '',
        'lessons',  '[]'::jsonb,
        'quiz',     'null'::jsonb
      )
      order by m.ord
    ) as modules
  from syllabus s
  cross join unnest(s.titles) with ordinality as m(title, ord)
  group by s.slug
)
update public.courses c
   set modules = b.modules
  from built b
 where c.slug = b.slug
   -- Never overwrite an edited syllabus.
   and jsonb_array_length(coalesce(c.modules, '[]'::jsonb)) = 0;

-- The label the website prints beside each course is copy, not a count, and
-- 0009 wrote each one by hand. Only a disagreeing number is corrected here —
-- a card reading "15 modules" above fourteen is a bug someone eventually
-- reports, whereas "13 Modules" is just how that page is written.
update public.courses
   set modules_label = jsonb_array_length(modules) || ' modules'
 where jsonb_array_length(coalesce(modules, '[]'::jsonb)) > 0
   and coalesce(substring(modules_label from '[0-9]+'), '') <> jsonb_array_length(modules)::text;
