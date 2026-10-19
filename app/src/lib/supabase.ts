import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { LookupResponse, SymbolMatch } from "@shared/api.ts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

export const supabase =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : undefined;

/** Dev server only: signs in as the local dev account, which needs no email. */
export async function signInAsDevAccount() {
  const response = await fetch("/__dev/session");
  if (!response.ok) throw new Error(await response.text());
  const { error } = await supabase!.auth.setSession((await response.json()) as Session);
  if (error) throw error;
}

/** Undefined until known; null when signed out. */
export type SessionState = Session | null | undefined;

export function useSession(): SessionState {
  const [session, setSession] = useState<SessionState>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** Yahoo symbol search. */
export async function lookupSymbols(query: string, accessToken: string): Promise<SymbolMatch[]> {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/vantage?lookup=${encodeURIComponent(query)}`,
    {
      headers: { apikey: SUPABASE_KEY ?? "", Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
  return ((await response.json()) as LookupResponse).results;
}
