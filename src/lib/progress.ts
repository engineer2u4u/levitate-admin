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
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  learner_name: string;
  learner_org: string;
};

export type CourseOutline = {
  title: string;
  items: { id: string; title: string; module: string; kind: string }[];
};

/**
 * "p-week1-legal-foundations" -> "Week1 legal foundations".
 *
 * The item ids come from the database; their titles live in the website's
 * code, which this app does not read. A tidied id is a worse label than a real
 * title and a much better one than a bare slug, and the id itself stays on the
 * row as a tooltip so there is no ambiguity about which item it is.
 */
export function labelForItem(id: string): string {
  const words = id.replace(/^[a-z]-/, "").replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

/**
 * The outline for a course, built from what the admin already holds.
 *
 * This used to be a hardcoded map, and it was empty — which is why every
 * journey read "0 of ?". The real lists are in `courses.modules[].itemIds`,
 * written by migration 0015 and kept in step with the website's content, so
 * the count here is exact rather than guessed.
 *
 * Null for a course whose modules carry no item ids: that is genuinely unknown
 * rather than zero, and the screen says so.
 */
export function outlineFor(
  courses: { slug: string; title: string; modules: { title: string; itemIds?: string[] }[] }[],
  slug: string,
): CourseOutline | null {
  const course = courses.find((c) => c.slug === slug);
  if (!course) return null;

  const items = course.modules.flatMap((m) =>
    (m.itemIds ?? []).map((id) => ({
      id,
      title: labelForItem(id),
      module: m.title,
      // The database records which items a module holds, not what kind each
      // one is. Saying "item" is honest; guessing from the id would not be.
      kind: "item",
    })),
  );

  return items.length ? { title: course.title, items } : null;
}

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

export function summarise(row: ProgressRow, outline: CourseOutline | null) {
  const total = outline?.items.length ?? 0;
  const done = row.completed_items?.length ?? 0;
  return {
    total,
    done,
    percent: total === 0 ? 0 : Math.round((Math.min(done, total) / total) * 100),
    finished: Boolean(row.completed_at),
  };
}
