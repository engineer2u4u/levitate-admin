-- Levitate LMS — storage for course imagery
--
-- Course banners, module covers and lesson illustrations. The catalogue is a
-- public site, so the bucket is public-read: the URLs end up in the learner
-- app's HTML either way, and a signed URL that expires would only break the
-- page. Writing is admins-only, through the same `is_admin()` the rest of the
-- schema uses.
--
-- Re-runnable, like the migrations before it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-media',
  'course-media',
  true,
  -- 5 MB. A 1600×600 banner has no business being larger, and the cap is the
  -- difference between a slow catalogue and a fast one.
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read: these are catalogue images on a public site.
drop policy if exists course_media_public_read on storage.objects;
create policy course_media_public_read on storage.objects
  for select using (bucket_id = 'course-media');

-- Only admins write. A viewer signed into the portal cannot upload, replace or
-- delete imagery, matching every other write in the schema.
drop policy if exists course_media_admin_insert on storage.objects;
create policy course_media_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-media' and public.is_admin());

drop policy if exists course_media_admin_update on storage.objects;
create policy course_media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'course-media' and public.is_admin())
  with check (bucket_id = 'course-media' and public.is_admin());

drop policy if exists course_media_admin_delete on storage.objects;
create policy course_media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-media' and public.is_admin());
