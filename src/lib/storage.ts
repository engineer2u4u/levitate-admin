import { getClient, supabaseConfigured } from "./supabase";

/** Bucket created by migration 0003. Public-read, admin-write. */
const BUCKET = "course-media";

/** Matches the bucket's own limit, so an oversized file is refused before it
 *  is uploaded rather than after. */
export const MAX_BYTES = 5 * 1024 * 1024;

const IMAGES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const DOCUMENTS = ["application/pdf"];

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Puts an image in the bucket and returns its public URL.
 *
 * `folder` groups uploads by what they belong to (`banners`, `modules`,
 * `lessons`) so the bucket stays legible in the dashboard. Names are
 * randomised rather than taken from the file, because two people uploading
 * `banner.jpg` must not overwrite each other.
 */
export function uploadImage(file: File, folder: string): Promise<UploadResult> {
  return put(file, folder, IMAGES, "Use a JPEG, PNG, WebP, AVIF or GIF.");
}

/**
 * Puts a course brochure in the same bucket. It is catalogue media like a
 * banner — public to read, admin to write — so it needs no bucket of its own,
 * only the PDF type that migration 0010 adds.
 */
export function uploadBrochure(file: File, folder: string): Promise<UploadResult> {
  return put(file, folder, DOCUMENTS, "A brochure has to be a PDF.");
}

async function put(file: File, folder: string, allowed: string[], wrongType: string): Promise<UploadResult> {
  if (!supabaseConfigured) {
    return { ok: false, error: "Supabase is not configured, so nothing can be uploaded." };
  }
  if (!allowed.includes(file.type)) {
    return { ok: false, error: wrongType };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `That file is ${mb(file.size)} MB. The limit is 5 MB — export it smaller.` };
  }

  const supabase = await getClient();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      return { ok: false, error: "The course-media bucket is missing — run migration 0003 in Supabase." };
    }
    if (/mime type|not supported/i.test(error.message)) {
      return { ok: false, error: "The bucket refuses that file type — run migration 0010 in Supabase." };
    }
    if (/row-level security|unauthorized|403/i.test(error.message)) {
      return { ok: false, error: "Only an admin can upload files." };
    }
    return { ok: false, error: error.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/**
 * Removes a file previously uploaded here.
 *
 * Best-effort: a course still saves if the old file cannot be cleaned up, and
 * a stray object is a smaller problem than a failed save.
 */
export async function deleteUpload(url: string): Promise<void> {
  if (!supabaseConfigured || !url) return;
  const marker = `/${BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return;
  const path = url.slice(at + marker.length).split("?")[0];
  const supabase = await getClient();
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
