/// <reference lib="dom" />
import type { Page } from "@playwright/test";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

// The tables are untyped here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export const TEST_EMAIL = process.env.VANTAGE_TEST_EMAIL ?? "e2e@vantage.test";
export const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
export const ANON_KEY = process.env.VITE_SUPABASE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export const canSignIn = Boolean(SUPABASE_URL && ANON_KEY && SECRET_KEY);

export const persistedSessionKey = () =>
  `sb-${new URL(SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;

export async function testSession(): Promise<Session> {
  const admin: Admin = createClient(SUPABASE_URL!, SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const created = await admin.auth.admin.createUser({ email: TEST_EMAIL, email_confirm: true });
  if (created.error && !/already|exists|registered/i.test(created.error.message))
    throw created.error;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: TEST_EMAIL });
  if (link.error) throw link.error;
  await seedTemplateIfEmpty(admin, link.data.user.id);
  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
  const otp = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.data.properties.hashed_token,
  });
  if (otp.error || !otp.data.session) throw otp.error ?? new Error("No session");
  return otp.data.session;
}

const admin = (): Admin =>
  createClient(SUPABASE_URL!, SECRET_KEY!, { auth: { persistSession: false } });

/** Local runs all come from one address; clear its budgets so repeated runs stay inside the rate limits. */
export async function resetThrottle() {
  if (process.env.E2E_BASE_URL || !canSignIn) return;
  await admin().from("throttle").delete().in("route", ["signed-out", "onboard"]);
}

export async function deleteUser(email: string) {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === email);
  if (user) await admin().auth.admin.deleteUser(user.id);
}

async function seedTemplateIfEmpty(admin: Admin, owner: string) {
  const { count } = await admin
    .from("watchlist")
    .select("ticker", { count: "exact", head: true })
    .eq("owner", owner);
  if (count) return;
  const themes = await admin.from("default_themes").select("id,label,position");
  const items = await admin
    .from("default_watchlist")
    .select("ticker,name,quote_symbol,currency,themes,aliases,disabled,position");
  if (themes.data?.length)
    await admin.from("watchlist_themes").insert(themes.data.map((t) => ({ ...t, owner })));
  if (items.data?.length)
    await admin.from("watchlist").insert(items.data.map((i) => ({ ...i, owner })));
}

export async function signIn(page: Page): Promise<Session> {
  const session = await testSession();
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [persistedSessionKey(), JSON.stringify(session)],
  );
  return session;
}

export const restHeaders = (session: Session) => ({
  apikey: ANON_KEY ?? "",
  Authorization: `Bearer ${session.access_token}`,
  "Content-Type": "application/json",
});

/** Local, not UTC, to match what the app shows. */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function seedSnapshot(session: Session) {
  const admin: Admin = createClient(SUPABASE_URL!, SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await admin.from("portfolio_snapshots").upsert({
    owner: session.user.id,
    as_of: localDay(),
    account_id: "U0000000",
    base_currency: "EUR",
    nav: 200_000,
    cash: -50_000,
  });
  if (error) throw new Error(error.message);
}
