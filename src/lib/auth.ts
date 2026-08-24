import { getClient, supabaseConfigured } from "./supabase";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  /** Only `admin` may use this app. RLS enforces the same rule server-side. */
  role: "learner" | "admin";
};

export type AuthResult = { ok: true; user: AdminUser } | { ok: false; error: string };

type ProfileRow = { name: string | null; role: "learner" | "admin" | null };

/**
 * Loads the signed-in user together with their role.
 *
 * The role comes from `public.profiles`, not from the JWT, so revoking someone
 * takes effect on their next request rather than whenever their token happens
 * to expire.
 */
export async function currentUser(): Promise<AdminUser | null> {
  if (!supabaseConfigured) return null;
  const supabase = await getClient();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", u.id)
    .maybeSingle<ProfileRow>();

  return {
    id: u.id,
    email: u.email ?? "",
    name: profile?.name?.trim() || (u.email ?? "").split("@")[0],
    // Absent profile means the trigger has not run for this account — treat as
    // the least privilege rather than assuming.
    role: profile?.role ?? "learner",
  };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabaseConfigured) return { ok: false, error: "Supabase is not configured." };
  const supabase = await getClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, error: error.message };
  const user = await currentUser();
  return user ? { ok: true, user } : { ok: false, error: "Signed in, but the profile could not be read." };
}

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  if (!supabaseConfigured) return { ok: false, error: "Supabase is not configured." };
  const supabase = await getClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name.trim() } },
  });
  if (error) return { ok: false, error: error.message };
  // With email confirmation on there is no session yet — say so rather than
  // dropping the person on a screen that looks signed out for no reason.
  if (!data.session) {
    return { ok: false, error: "Account created. Confirm your email, then sign in." };
  }
  const user = await currentUser();
  return user ? { ok: true, user } : { ok: false, error: "Sign-up succeeded but the profile could not be read." };
}

export async function signOut() {
  if (!supabaseConfigured) return;
  const supabase = await getClient();
  await supabase.auth.signOut();
}

/** Fires whenever the session changes. Returns an unsubscribe. */
export function onAuthChange(cb: () => void): () => void {
  if (!supabaseConfigured) return () => {};
  let unsub = () => {};
  void getClient().then((supabase) => {
    const { data } = supabase.auth.onAuthStateChange(() => cb());
    unsub = () => data.subscription.unsubscribe();
  });
  return () => unsub();
}
