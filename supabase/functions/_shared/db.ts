import { createClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Hosted runtimes list the project's keys as JSON under SUPABASE_*_KEYS; the local CLI will not pass that prefix, so config.toml uses VANTAGE_*_KEYS.
function projectKey(kind: "PUBLISHABLE" | "SECRET"): string {
  const list = Deno.env.get(`SUPABASE_${kind}_KEYS`) ?? Deno.env.get(`VANTAGE_${kind}_KEYS`);
  const key = list ? (JSON.parse(list) as Record<string, string>).default : undefined;
  if (!key) throw new Error(`No default ${kind.toLowerCase()} key in SUPABASE_${kind}_KEYS`);
  return key;
}

/** Sent as `apikey` by every caller, and handed to agents. */
export const PUBLISHABLE_KEY = projectKey("PUBLISHABLE");
/** Not a JWT: it goes in the `apikey` header only. */
export const SECRET_KEY = projectKey("SECRET");

/** Row security does not apply to the secret key, so every query scopes to the caller itself. */
export const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
