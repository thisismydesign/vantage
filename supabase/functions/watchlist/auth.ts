import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Caller = { via: "session"; owner: string; email?: string } | { via: "none" };

export async function resolveCaller(db: SupabaseClient, request: Request): Promise<Caller> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { via: "none" };
  // The publishable key the browser sends for anonymous reads is not a user and falls through.
  const { data } = await db.auth.getUser(token);
  if (!data.user) return { via: "none" };
  return { via: "session", owner: data.user.id, email: data.user.email };
}
