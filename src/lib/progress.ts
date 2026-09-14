import { getClient, supabaseConfigured } from "./supabase";

/**
 * Learner journeys through self-paced courses.
 *
 * Read straight from Supabase rather than the local store the rest of the
 * admin uses: this is the one dataset the learner site writes, so a browser
 * copy here would be a copy of nothing. RLS does the filtering — an admin's
 * token returns every row, a learner's returns only their own.
 */
export type ProgressRow = {
  id: string;
  user_id: string;
  course_slug: string;
  completed_items: string[];
  quiz_attempts: Record<string, { score: number; total: number }>;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  learner_name: string;
  learner_org: string;
};

/**
 * The course outlines the admin needs to turn a list of finished item ids into
 * "4 of 9". Kept here rather than fetched: the learner site owns the content,
 * and duplicating the shape — not the copy — is enough to report on it.
 *
 * Empty since the demo course, the only self-paced one, was removed (0012).
 * A journey on a course with no outline here shows its slug and a raw count.
 */
export const COURSE_OUTLINES: Record<string, { title: string; items: { id: string; title: string; module: string; kind: string }[] }> = {};

export const outlineFor = (slug: string) => COURSE_OUTLINES[slug] ?? null;

/** Newest activity first — the question is usually "who is moving". */
export async function listProgress(): Promise<ProgressRow[]> {
  if (!supabaseConfigured) {
    throw new Error("Supabase is not configured, so there are no learner journeys to read.");
  }
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("course_progress_admin")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    if (/does not exist/i.test(error.message)) {
      throw new Error("The course_progress table is missing — run migration 0004 in Supabase.");
    }
    throw new Error(error.message);
  }
  return (data ?? []) as ProgressRow[];
}

export function summarise(row: ProgressRow) {
  const outline = outlineFor(row.course_slug);
  const total = outline?.items.length ?? 0;
  const done = row.completed_items?.length ?? 0;
  return {
    total,
    done,
    percent: total === 0 ? 0 : Math.round((Math.min(done, total) / total) * 100),
    finished: Boolean(row.completed_at),
  };
}
