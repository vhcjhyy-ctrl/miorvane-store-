import { createServerSupabaseClient } from "./server";

export interface AuthenticatedUser {
  id: string;
}

export interface AuthCheck {
  configured: boolean;
  user: AuthenticatedUser | null;
}

/** Validate the Supabase session with the auth server; never trust client-supplied user IDs. */
export async function getAuthenticatedUser(): Promise<AuthCheck> {
  const client = await createServerSupabaseClient();
  if (!client) return { configured: false, user: null };

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { configured: true, user: null };
  return { configured: true, user: { id: data.user.id } };
}
