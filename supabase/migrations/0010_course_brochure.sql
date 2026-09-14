-- A downloadable brochure per course, and the storage to hold it.
--
-- The course form no longer edits the catalogue's copy — the title, fee, mode
-- and card text are the website's, set here once and changed by migration.
-- What an admin still owns is the start, the syllabus titles, whether the
-- course is published, what a published course offers, and the brochure a
-- visitor downloads. This adds the last of those.
--
-- Re-runnable, like the migrations before it.

alter table public.courses
  -- The brochure PDF, in the course-media bucket (0003). Empty where there
  -- is none: the website shows no download rather than a broken link.
  add column if not exists brochure_url text not null default '';

-- Read with the rest of what the site prints. Columns are granted one by one
-- (0008), so a new one is invisible to the public until it is listed.
grant select (brochure_url) on public.courses to anon;

-- The bucket was images only. A brochure is a PDF, so the type is added to
-- the same bucket rather than a second one: it is catalogue media, public to
-- read and admin to write, exactly like a banner. The 5 MB cap is unchanged —
-- a brochure above that is a brochure nobody on a phone will wait for.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-media',
  'course-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
