import type { SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True once a project is configured at build time. */
export const supabaseConfigured = Boolean(URL && ANON);

/**
 * The client is imported lazily so the SDK is only fetched when a project is
 * actually configured — an unconfigured build should not pay for it.
 */
let clientPromise: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  if (!supabaseConfigured) {
    return Promise.reject(new Error("Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  }
  clientPromise ??= import("@supabase/supabase-js").then((m) =>
    m.createClient(URL, ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Invite and sign-in links arrive with the session in the URL; this is
        // what reads it and cleans the address bar.
        detectSessionInUrl: true,
        // Implicit, not PKCE, on purpose. PKCE keeps a verifier in the browser
        // that requested the link, so a link opened on a phone when it was
        // requested on a laptop would fail — which is exactly how invites get
        // opened.
        flowType: "implicit",
      },
    }),
  );
  return clientPromise;
}

/**
 * Where an emailed link should land — always this admin portal, never the
 * learner site, even though both share one Supabase project.
 *
 * Set `NEXT_PUBLIC_ADMIN_URL` when the admin is served from a subfolder or
 * behind a different hostname than the one the invite was sent from.
 */
export function adminUrl(path = ""): string {
  const configured = process.env.NEXT_PUBLIC_ADMIN_URL?.trim();
  const base = configured
    ? configured.replace(/\/+$/, "") + "/"
    : typeof window !== "undefined"
      ? window.location.origin + "/"
      : "";
  return base + path;
}

/**
 * The page an emailed link opens.
 *
 * Deliberately not `/`, which only exists to redirect: the session arrives in
 * the URL fragment, and a redirect on arrival can drop it before the client
 * has loaded and read it. Landing on a real page removes the race — and puts
 * the person on the screen they wanted anyway.
 */
export const LANDING = "enrolments/";

/* ---------------------------------------------------------------- mapping */

/** Row shapes as they come back from Postgres (snake_case). */
export type CourseRow = {
  id: string; slug: string; title: string; category: string; description: string;
  duration: string; price_paise: number; status: "draft" | "live" | "archived"; created_at: string;
};

export type SessionRow = {
  id: string; course_id: string; starts_on: string | null; date_label: string;
  time_label: string; mode: string; trainer: string; seats: number;
  status: "draft" | "open" | "closed"; created_at: string;
};

export type EnrolmentRow = {
  id: string; user_id: string | null; name: string; email: string; phone: string;
  course_id: string; session_id: string; source: "Phone" | "Website" | "Corporate";
  amount_paise: number; seats: number; method: "link" | "invoice" | "paid";
  paid: boolean; created_at: string;
};

/**
 * A URL-safe slug for a course title. Courses are addressed by slug on the
 * learner site, so the admin has to mint one on create.
 */
export function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "course";
}
