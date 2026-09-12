-- The website's catalogue as it stood when the site started reading it from
-- here: every course, the masterclass, and their dates.
--
-- Copied from the site's own source (courses.ts, site.ts, masterclass.ts,
-- poshCurriculum.ts) on 12 September 2026. From now on this table is the
-- source and those files are only the fallback for a build that cannot reach
-- the database.
--
-- Placeholders the site fills in from the dates and fees:
--   {starts}        first open session, e.g. "3 October"
--   {starts_short}  the same, e.g. "3 Oct"
--   {fee}           the fee, e.g. "₹32,000"
--
-- Insert-only: a course whose slug already exists is left exactly as it is,
-- so re-running this can never undo an admin's edits. Sessions are added only
-- to a course that has none.

insert into public.courses (
  slug, title, short, tag, category, description, mode, duration, tenure,
  status, site_status, hidden, price_paise, price_on_request, price_note,
  list_price_paise, modules_label, hours_label, facilitator_name, image,
  sort_order, starts_label, live_session_count, live_session_schedule, batch
) values
(
  'posh-trainer',
  'PoSH & Workplace Dignity Facilitator Program (PoSH TTT)',
  'PoSH Train-the-Trainer', 'Enrolling', 'PoSH · Train-the-Trainer',
  -- The site's copy said "11 practice-led modules" beside a "15 modules"
  -- label; the curriculum has 15.
  'Build legal understanding, inquiry competence and PoSH facilitation skills across 15 practice-led modules.',
  'Live online · Weekend batch', '15 hours', '3 weekends',
  'live', 'enrolling', false, 3200000, false, 'incl. taxes · from {starts_short}',
  null, '15 modules', '15 learning hours', 'Parichita Kotnala', '/assets/workshop-tables.jpeg',
  1, '', 6, 'Saturdays and Sundays, 6:00 – 8:00 PM IST',
  $j${
    "show": true,
    "tag": "PoSH Train-the-Trainer",
    "title": "PoSH TTT Certification",
    "short": "PoSH TTT",
    "status_label": "Enrolling",
    "rows": [
      {"k": "Batch starts", "v": "{starts}"},
      {"k": "Duration", "v": "3 weeks"},
      {"k": "Batch type", "v": "Weekend batch"},
      {"k": "Daily", "v": "2 hours per day"},
      {"k": "Timing", "v": "6:00 – 8:00 PM"},
      {"k": "Mode", "v": "Live online"}
    ],
    "fee_note": "inclusive of taxes",
    "cta": "Enrol for this batch"
  }$j$::jsonb
),
(
  'pocso-child-safety',
  'POCSO & Child Safety Facilitator Program (POCSO TTT)',
  'POCSO & Child Safety', 'Enrolling', 'POCSO · Train-the-Trainer',
  'Facilitate child-safety awareness with sensitivity, legal clarity and responsible communication.',
  'Live online · 3 days', '9 hours', '3 days',
  'live', 'enrolling', false, 2000000, false, 'incl. taxes · from {starts_short}',
  null, '8 modules', '9 hours', 'Parichita Kotnala', '/assets/school-group.jpeg',
  2, '', 3, 'Three evenings, 6:00 – 8:00 PM IST',
  $j${
    "show": true,
    "tag": "POCSO Train-the-Trainer",
    "title": "POCSO TTT Certification",
    "short": "POCSO TTT",
    "status_label": "Enrolling",
    "rows": [
      {"k": "Batch starts", "v": "{starts}"},
      {"k": "Duration", "v": "3 days"},
      {"k": "Daily", "v": "2 hours per day"},
      {"k": "Timing", "v": "6:00 – 8:00 PM"},
      {"k": "Mode", "v": "Live online"},
      {"k": "Seats", "v": "Limited cohort"}
    ],
    "fee_note": "inclusive of taxes",
    "cta": "Enrol for this batch"
  }$j$::jsonb
),
(
  'inclusive-workplace',
  'Inclusive Workplace Facilitator Program (DEI TTT)',
  'Inclusive Workplace', 'DEI · TTT', 'DEI · Train-the-Trainer',
  'A 20-hour applied Train-the-Trainer certification anchored in the BRIDGE Inclusion Framework, translating inclusion from concept into everyday workplace behaviour.',
  'Live online · from {starts}', '20 hours', '',
  'live', 'enrolling', false, 4000000, false, 'incl. taxes · from {starts}',
  null, '13 Modules', '20 Hours', 'Parichita Kotnala', '/assets/workshop-handsup.jpeg',
  3, '', 0, '',
  $j${
    "show": true,
    "tag": "DEI Train-the-Trainer",
    "title": "Diversity, Equity & Inclusion Batch",
    "short": "DEI TTT",
    "status_label": "Enrolling",
    "rows": [
      {"k": "Batch starts", "v": "{starts}"},
      {"k": "Duration", "v": "20 hours"},
      {"k": "Curriculum", "v": "13 modules"},
      {"k": "Timing", "v": "To be confirmed"},
      {"k": "Mode", "v": "Live online"}
    ],
    "fee_note": "inclusive of taxes",
    "cta": "Enrol for this batch"
  }$j$::jsonb
),
(
  'workplace-wellbeing',
  'Workplace Wellbeing Facilitator Program (Mental Health & Wellbeing TTT)',
  'Workplace Wellbeing', 'Wellbeing', 'Wellbeing · Train-the-Trainer',
  'Facilitate workplace mental-health conversations with confidence, sensitivity and ethical care.',
  'Live online · dates announced soon', '', '',
  'live', 'waitlist', false, 0, true, 'confirmed with batch dates',
  null, 'Curriculum on request', 'To be confirmed', 'Parichita Kotnala', '/assets/outdoor-group.jpeg',
  4, 'October 2026', 0, '',
  $j${
    "show": true,
    "tag": "Wellbeing Train-the-Trainer",
    "title": "Mental Health & Well-being Batch",
    "short": "Wellbeing TTT",
    "status_label": "Dates coming soon",
    "rows": [
      {"k": "Batch month", "v": "{starts}"},
      {"k": "Exact dates", "v": "To be announced"},
      {"k": "Timing", "v": "To be confirmed"},
      {"k": "Mode", "v": "Live online"}
    ],
    "fee_note": "confirmed with batch dates",
    "cta": "Join the waitlist"
  }$j$::jsonb
),
(
  'leadership-facilitator',
  'Corporate Leadership Facilitator Program (CLF TTT)',
  'Leadership Facilitator', 'Flagship', 'Leadership · Train-the-Trainer',
  'Facilitate leadership conversations on trust, coaching, feedback, accountability and team growth.',
  'Live online · cohort based', '', '',
  'live', 'waitlist', false, 0, true, 'HUMAN Leadership Framework',
  null, 'Curriculum on request', 'To be confirmed', 'Parichita Kotnala', '/assets/audience-red-hall.jpeg',
  5, '', 0, '',
  '{"show": false}'::jsonb
),
(
  'hr-edge',
  'HR Edge certification (HR Students)',
  'HR Edge', 'For students', 'Institutional',
  'Integrated DEI, PoSH and wellbeing certification for MBA-HR and early-career HR professionals.',
  'Blended · campus cohorts', '', '',
  'live', 'waitlist', false, 0, true, 'institutional pricing available',
  null, 'Curriculum on request', 'To be confirmed', 'Parichita Kotnala', '/assets/students-group.png',
  6, '', 0, '',
  '{"show": false}'::jsonb
),
(
  'posh-masterclass-2026',
  'PoSH 2026: The New Compliance & Workplace Reality',
  'PoSH 2026 Masterclass', 'Masterclass', 'Masterclass',
  'Judicial Developments, Evolving Workplaces & the AI × PoSH Intersection',
  'Live masterclass', '2 Hours', '',
  -- Hidden: it has its own page and is not part of the course catalogue.
  'live', 'enrolling', true, 199900, false, 'Early bird · incl. of taxes',
  299900, '', '2 Hours', 'Parichita Kotnala', '',
  50, '', 1, '',
  '{"show": false}'::jsonb
),
(
  'demo-course',
  'Demo · Workplace Facilitation Essentials',
  'Demo course', 'Demo', 'Demo',
  'A sample course for exercising the learning flow: sequential unlocking, progress tracking and the reading kit released on completion.',
  'Self-paced · unlocks in order', '45 minutes', '',
  -- A test fixture: published so a testing build can buy it, hidden so nobody
  -- else ever sees it.
  'live', 'enrolling', true, 100000, false, 'simulated payment · for testing',
  null, '3 modules', '45 min', 'Parichita Kotnala', '/assets/workshop-tables.jpeg',
  99, '', 0, '',
  '{"show": false}'::jsonb
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------- sessions

-- Seats are a placeholder capacity (the site does not show them); set the
-- real number in the admin's Sessions screen.
with s (slug, starts_on, date_label, time_label, topic, starts_at, ends_at) as (
  values
    ('posh-trainer', date '2026-10-03', 'Sat 3 Oct 2026',  '6:00 – 8:00 PM', 'Foundations & the CLEAR framework',        timestamptz '2026-10-03 18:00+05:30', timestamptz '2026-10-03 20:00+05:30'),
    ('posh-trainer', date '2026-10-04', 'Sun 4 Oct 2026',  '6:00 – 8:00 PM', 'Legal genesis & applied definitions',      timestamptz '2026-10-04 18:00+05:30', timestamptz '2026-10-04 20:00+05:30'),
    ('posh-trainer', date '2026-10-10', 'Sat 10 Oct 2026', '6:00 – 8:00 PM', 'Recognition, coverage & jurisdiction',     timestamptz '2026-10-10 18:00+05:30', timestamptz '2026-10-10 20:00+05:30'),
    ('posh-trainer', date '2026-10-11', 'Sun 11 Oct 2026', '6:00 – 8:00 PM', 'IC governance & fair inquiry practice',    timestamptz '2026-10-11 18:00+05:30', timestamptz '2026-10-11 20:00+05:30'),
    ('posh-trainer', date '2026-10-17', 'Sat 17 Oct 2026', '6:00 – 8:00 PM', 'Case laboratory · live inquiry simulation', timestamptz '2026-10-17 18:00+05:30', timestamptz '2026-10-17 20:00+05:30'),
    ('posh-trainer', date '2026-10-18', 'Sun 18 Oct 2026', '6:00 – 8:00 PM', 'Trainer craft & facilitation assessment',  timestamptz '2026-10-18 18:00+05:30', timestamptz '2026-10-18 20:00+05:30'),
    -- Only the start of these two batches is fixed so far.
    ('pocso-child-safety',  date '2026-10-24', 'Sat 24 Oct 2026', '6:00 – 8:00 PM',   '', timestamptz '2026-10-24 18:00+05:30', timestamptz '2026-10-24 20:00+05:30'),
    ('inclusive-workplace', date '2026-10-10', 'Sat 10 Oct 2026', 'To be confirmed',  '', null, null),
    ('posh-masterclass-2026', date '2026-09-27', 'Sun 27 Sep 2026', '11:30 AM – 1:30 PM IST', 'PoSH 2026: The New Compliance & Workplace Reality',
      timestamptz '2026-09-27 11:30+05:30', timestamptz '2026-09-27 13:30+05:30')
)
insert into public.sessions (course_id, starts_on, date_label, time_label, mode, trainer, seats, status, topic, starts_at, ends_at)
select c.id, s.starts_on, s.date_label, s.time_label, 'Live online', 'Parichita Kotnala', 30, 'open', s.topic, s.starts_at, s.ends_at
from s
join public.courses c on c.slug = s.slug
where not exists (select 1 from public.sessions x where x.course_id = c.id);
