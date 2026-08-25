import { getClient, supabaseConfigured } from "./supabase";

/** What an account may do in this portal. `learner` means: nothing here. */
export type Role = "learner" | "viewer" | "admin";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /**
   * False for someone who arrived through an invite link and has never chosen
   * a password. The portal makes them choose one before it opens.
   *
   * Held in `user_metadata`, which the account itself can write. That is fine:
   * this is a first-run step, not a permission. Someone who cleared the flag by
   * hand would only be skipping a prompt they are already entitled to pass, and
   * would still have no password to sign in with next time.
   */
  passwordSet: boolean;
};

export type AuthResult = { ok: true; user: AdminUser } | { ok: false; error: string };

type ProfileRow = { name: string | null; role: Role | null };

/** Admins write; viewers read. One place decides, so no screen has to guess. */
export const canWrite = (user: AdminUser | null) => user?.role === "admin";

/** Whether this account may open the portal at all. */
export const hasAccess = (user: AdminUser | null) => user?.role === "admin" || user?.role === "viewer";

/** An invited account that still has to choose a password before going in. */
export const needsPassword = (user: AdminUser | null) => user != null && !user.passwordSet;

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

  const read = async () =>
    (
      await supabase.from("profiles").select("name, role").eq("id", u.id).maybeSingle<ProfileRow>()
    ).data;

  let profile = await read();

  // No access yet? There may be an invite waiting on this address — someone
  // who already had a learner account gets it here rather than from the
  // sign-up trigger, which only fires for brand-new accounts.
  if (profile?.role !== "admin" && profile?.role !== "viewer") {
    const { data: claimed } = await supabase.rpc("claim_admin_invite");
    if (claimed === "admin" || claimed === "viewer") profile = await read();
  }

  return {
    id: u.id,
    email: u.email ?? "",
    name: profile?.name?.trim() || (u.email ?? "").split("@")[0],
    // Absent profile means the trigger has not run for this account — treat as
    // the least privilege rather than assuming.
    role: profile?.role ?? "learner",
    passwordSet: u.user_metadata?.password_set === true,
  };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabaseConfigured) return { ok: false, error: "Supabase is not configured." };
  const supabase = await getClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, error: error.message };

  // Getting here with a password is proof of having one — record it, or the
  // first-run gate would ask for a password from someone who just typed one.
  // Covers accounts made outside the invite flow, seeded ones included.
  if (data.user && data.user.user_metadata?.password_set !== true) {
    await supabase.auth.updateUser({ data: { password_set: true } });
  }

  const user = await currentUser();
  return user ? { ok: true, user } : { ok: false, error: "Signed in, but the profile could not be read." };
}

/**
 * Sets a password on the signed-in account.
 *
 * The sign-in screen takes a password and nothing else, so this is how an
 * invited person — who arrives through a link, with no password at all — gets
 * a way back in on their next visit.
 */
export async function setPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseConfigured) return { ok: false, error: "Supabase is not configured." };
  const supabase = await getClient();
  // Password and flag in one call, so the two cannot disagree if the second
  // request were to fail.
  const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
  return error ? { ok: false, error: error.message } : { ok: true };
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
