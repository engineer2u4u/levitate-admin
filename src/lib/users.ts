import { LANDING, adminUrl, getClient, supabaseConfigured } from "./supabase";

/** The two roles an invite can carry. `learner` is what revoking returns you to. */
export type PortalRole = "admin" | "viewer";

export const ROLE_LABEL: Record<PortalRole, string> = { admin: "Admin", viewer: "Viewer" };
export const ROLE_BLURB: Record<PortalRole, string> = {
  admin: "Full access — can create and edit everything, and invite other people.",
  viewer: "Read-only — can open every screen but cannot change anything.",
};

export type AccessUser = {
  id: string;
  name: string;
  email: string;
  role: PortalRole;
  joinedAt: string;
};

export type Invite = {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  createdAt: string;
};

type Result = { ok: true } | { ok: false; error: string };

const notConfigured = { ok: false as const, error: "Supabase is not configured." };

/** Everyone who can open the portal, admins first. */
export async function listUsers(): Promise<AccessUser[]> {
  if (!supabaseConfigured) return [];
  const supabase = await getClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, role, created_at")
    .in("role", ["admin", "viewer"])
    .order("role")
    .order("created_at");

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: ((r.name as string) ?? "").trim() || ((r.email as string) ?? "").split("@")[0],
    email: (r.email as string) ?? "",
    role: r.role as PortalRole,
    joinedAt: r.created_at as string,
  }));
}

/** Invites that have been sent but not yet used. */
export async function listInvites(): Promise<Invite[]> {
  if (!supabaseConfigured) return [];
  const supabase = await getClient();
  const { data } = await supabase
    .from("admin_invites")
    .select("id, email, name, role, created_at")
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    email: r.email as string,
    name: (r.name as string) ?? "",
    role: r.role as PortalRole,
    createdAt: r.created_at as string,
  }));
}

/**
 * Records the invitation, then emails the link.
 *
 * The row goes in first and on purpose: writing it is what RLS checks, so a
 * viewer cannot get as far as sending anything. The row is also what grants
 * the role — the email is only how the person reaches it. If delivery fails,
 * the invite still stands and can be resent.
 */
export async function sendInvite(input: { email: string; name: string; role: PortalRole }): Promise<Result> {
  if (!supabaseConfigured) return notConfigured;
  const supabase = await getClient();
  const email = input.email.trim().toLowerCase();

  const { data: me } = await supabase.auth.getUser();

  // Upsert, so re-inviting an address that was invited before updates the role
  // rather than colliding on the unique index.
  const { error: rowError } = await supabase.from("admin_invites").upsert(
    {
      email,
      name: input.name.trim(),
      role: input.role,
      invited_by: me.user?.id ?? null,
      accepted_at: null,
      accepted_by: null,
    },
    { onConflict: "email" },
  );
  if (rowError) return { ok: false, error: friendly(rowError.message) };

  return deliver(email);
}

/** Sends the link again for an invite that already exists. */
export async function resendInvite(email: string): Promise<Result> {
  if (!supabaseConfigured) return notConfigured;
  return deliver(email.trim().toLowerCase());
}

/**
 * The only place in the app allowed to create an account. Everywhere else uses
 * `shouldCreateUser: false`, so an address that was never invited cannot get
 * one by asking.
 */
async function deliver(email: string): Promise<Result> {
  const supabase = await getClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Lands on this portal, not the learner site, even though both apps sit on
    // the same Supabase project.
    options: { shouldCreateUser: true, emailRedirectTo: adminUrl(LANDING) },
  });
  if (error) {
    return {
      ok: false,
      error: /rate|limit|seconds/i.test(error.message)
        ? "The invite is saved, but Supabase is rate-limiting email right now. Try Resend in a minute."
        : `The invite is saved, but the email did not send: ${error.message}`,
    };
  }
  return { ok: true };
}

/** Withdraws an invite that has not been used. */
export async function cancelInvite(id: string): Promise<Result> {
  if (!supabaseConfigured) return notConfigured;
  const supabase = await getClient();
  const { error } = await supabase.from("admin_invites").delete().eq("id", id);
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function changeRole(userId: string, role: PortalRole): Promise<Result> {
  if (!supabaseConfigured) return notConfigured;
  const supabase = await getClient();
  const { error } = await supabase.rpc("set_admin_role", { target: userId, new_role: role });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/**
 * Takes the portal away without deleting the account.
 *
 * Deleting an auth user needs the service_role key, which a static export can
 * never hold. Dropping them to `learner` is what actually matters: every
 * policy in the database stops answering for them on their next request. The
 * spent invite goes too, so the address can be invited again later.
 */
export async function revokeAccess(userId: string, email: string): Promise<Result> {
  if (!supabaseConfigured) return notConfigured;
  const supabase = await getClient();
  const { error } = await supabase.rpc("set_admin_role", { target: userId, new_role: "learner" });
  if (error) return { ok: false, error: friendly(error.message) };
  await supabase.from("admin_invites").delete().eq("email", email.toLowerCase());
  return { ok: true };
}

/** Postgres speaks in error codes; the person reading this does not. */
function friendly(message: string) {
  if (/row-level security|42501|permission denied/i.test(message)) {
    return "Only an admin can do that.";
  }
  if (/duplicate key|unique/i.test(message)) {
    return "That address has already been invited.";
  }
  return message;
}
