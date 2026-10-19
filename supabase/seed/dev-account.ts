// Gives the account `pnpm run dev` signs in as the demo data, as rows; replaces it if it exists. `pnpm run db:reset` runs it after the reset.

import { createClient } from "@supabase/supabase-js";
import { demoRows } from "../../app/src/lib/demo/data.ts";

process.loadEnvFile(new URL("../../.env.development", import.meta.url));
const { SUPABASE_URL, SUPABASE_SECRET_KEY, VANTAGE_DEV_EMAIL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !VANTAGE_DEV_EMAIL)
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_SECRET_KEY and VANTAGE_DEV_EMAIL in .env.development",
  );
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(SUPABASE_URL))
  throw new Error(`Refusing to seed ${SUPABASE_URL}: the dev account belongs on the local stack`);

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const check = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
};

// Deleting the user removes its rows with it.
const { data: users, error } = await db.auth.admin.listUsers();
if (error) throw error;
const existing = users.users.find((u) => u.email === VANTAGE_DEV_EMAIL);
if (existing) check(await db.auth.admin.deleteUser(existing.id));
const created = await db.auth.admin.createUser({ email: VANTAGE_DEV_EMAIL, email_confirm: true });
if (created.error) throw created.error;
const owner = created.data.user.id;

const rows = demoRows(new Date());
const own = <T extends object>(list: T[]) => list.map((row) => ({ ...row, owner }));
// Events and news reference watchlist tickers, and positions their statement.
check(await db.from("watchlist_themes").insert(own(rows.themes)));
check(await db.from("watchlist").insert(own(rows.items)));
check(await db.from("trade_fills").insert(own(rows.fills)));
check(await db.from("portfolio_snapshots").insert(own([rows.snapshot])));
check(await db.from("snapshot_positions").insert(own(rows.positions)));
check(await db.from("nav_history").insert(own(rows.nav)));
check(await db.from("events").insert(own(rows.events)));
check(await db.from("news").insert(own(rows.news)));
console.log(`Seeded ${VANTAGE_DEV_EMAIL}`);
