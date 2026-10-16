import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

/** Browser client for auth and watchlist edits; undefined when not configured. */
export const supabase =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : undefined;

// Under `vite dev` the server mints a session for the configured account so
// local work needs no email. One request per page load, shared across hooks.
let devSession: Promise<Session | null> | undefined;
function mintDevSession(): Promise<Session | null> {
  devSession ??= fetch("/__dev/session")
    .then((r) => (r.ok ? (r.json() as Promise<Session>) : null))
    .catch(() => null);
  return devSession;
}

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (data.session || !import.meta.env.DEV) return setSession(data.session);
      const minted = await mintDevSession();
      if (minted) await supabase!.auth.setSession(minted);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export type SymbolMatch = { symbol: string; name: string; exchange: string; type: string };

/** Yahoo symbol search, proxied by the Edge Function; needs a signed-in user. */
export async function lookupSymbols(query: string, accessToken: string): Promise<SymbolMatch[]> {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/vantage?lookup=${encodeURIComponent(query)}`,
    {
      headers: { apikey: SUPABASE_KEY ?? "", Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
  return ((await response.json()) as { results: SymbolMatch[] }).results;
}
