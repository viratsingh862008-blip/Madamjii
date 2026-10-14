import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase =
  supabaseConfigured && supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export interface CareMembership {
  care_space_id: string;
  role: "admin" | "friend";
  membership_status: "active" | "revoked";
  care_spaces: { id: string; name: string; timezone: string } | null;
}

const USERNAME_ALIAS_DOMAIN = "accounts.areyouok.app";

export function usernameToAuthEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,24}$/.test(normalized)) {
    throw new Error("Username must be 3–24 characters using letters, numbers, dots, underscores or hyphens.");
  }
  // Supabase Auth currently authenticates with email/phone. This deterministic
  // internal alias lets the UI use usernames without collecting an email address.
  // Email confirmation must remain disabled; this alias is not a real inbox.
  return `${normalized}@${USERNAME_ALIAS_DOMAIN}`;
}

export async function signInWithPassword(username: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToAuthEmail(username), password });
  if (error) throw error;
}

export async function signUpWithPassword(username: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const normalized = username.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: usernameToAuthEmail(normalized),
    password,
    options: { data: { full_name: normalized } },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) throw new Error("That username is already taken. Choose another one.");
    throw error;
  }
  if (!data.session) {
    throw new Error("Username signup requires Supabase email confirmation to be disabled. No real email address is collected.");
  }
}

export async function getMemberships(): Promise<CareMembership[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in to view your care spaces.");
  const { data, error } = await supabase
    .from("care_members")
    .select("care_space_id, role, membership_status, care_spaces ( id, name, timezone )")
    .eq("user_id", userData.user.id)
    .eq("membership_status", "active");
  if (error) throw error;
  return (data ?? []) as unknown as CareMembership[];
}

export async function createCareSpace(
  name: string,
  timezone: string,
  scope: { shared_schedules: boolean; daily_summary: boolean; message_history: boolean },
): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in before creating a care space.");
  const { error } = await supabase.rpc("create_care_space_with_consent", {
    p_name: name.trim(),
    p_timezone: timezone,
    p_consent_scope: scope,
  });
  if (error) throw error;
}

export async function createCareInvitation(careSpaceId: string): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("create_care_invitation", {
    p_care_space_id: careSpaceId,
  });
  if (error) throw error;
  if (typeof data !== "string" || !/^[a-f0-9]{64}$/.test(data)) {
    throw new Error("The invitation service returned an invalid token.");
  }
  return data;
}

export async function acceptCareInvitation(
  token: string,
  scope: { shared_schedules: boolean; daily_summary: boolean; message_history: boolean },
): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  const { data, error } = await supabase.rpc("accept_care_invitation", {
    p_token: token,
    p_consent_scope: scope,
    p_timezone: timezone,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("The invitation could not be accepted.");
  return data;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export type AuthSession = Session;