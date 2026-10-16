// Broker sync for Vantage. Pulls Interactive Brokers Flex statements into
// per-owner tables.
//
//   PUT    /   {token?, positionsQueryId, tradesQueryId?}   save a connection (session)
//   DELETE /                                                 remove it (session)
//   POST   /   {}                                            sync the caller now (session)
//   POST   /   {"all": true}                                 sync every owner (scheduler, sync key)
//
// Tokens live in Vault; the helpers in the database hand them to this function
// and to nothing else.

import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchStatement, parseStatement, parseTrades, type FlexTrade } from "../_shared/flex.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/** What the scheduler sends; set with `supabase secrets set BROKER_SYNC_KEY=…`. */
const SYNC_KEY = Deno.env.get("BROKER_SYNC_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

type Connection = {
  owner: string;
  positions_query_id: string;
  trades_query_id: string | null;
  last_statement_date: string | null;
  last_synced_at: string | null;
};

/** The previous weekday, which is the newest session a statement can cover. */
function previousSession(now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function syncOwner(c: Connection, force: boolean) {
  if (!force && c.last_statement_date && c.last_statement_date >= previousSession()) {
    return { owner: c.owner, skipped: "up to date", statementDate: c.last_statement_date };
  }
  const { data: token, error: tokenError } = await db.rpc("broker_token_get", { p_owner: c.owner });
  if (tokenError || !token) throw new Error(tokenError?.message ?? "No broker token stored");

  const positionsXml = await fetchStatement(token as string, c.positions_query_id);
  const statement = parseStatement(positionsXml);
  const asOf = statement.toDate || new Date().toISOString().slice(0, 10);
  const snapshot = {
    owner: c.owner,
    as_of: asOf,
    account_id: statement.accountId,
    base_currency: statement.nav?.currency ?? statement.cash?.currency ?? null,
    nav: statement.nav?.total ?? null,
    cash: statement.cash?.value ?? statement.nav?.cash ?? null,
    positions: statement.positions,
    fetched_at: new Date().toISOString(),
  };
  const up = await db.from("portfolio_snapshots").upsert(snapshot, { onConflict: "owner,as_of" });
  if (up.error) throw new Error(up.error.message);

  let fills = 0;
  if (c.trades_query_id) {
    const tradesXml = await fetchStatement(token as string, c.trades_query_id);
    const trades = parseTrades(tradesXml);
    const rows = trades.trades
      .filter((t) => t.assetCategory !== "CASH")
      .map((t: FlexTrade) => ({
        owner: c.owner,
        id: t.tradeId || `${t.accountId}:${t.conid}:${t.dateTime}:${t.quantity}:${t.price}`,
        traded_at: t.dateTime ? new Date(t.dateTime).toISOString() : null,
        data: t,
      }));
    // Newer statements win on a duplicate id: a later fetch can carry a corrected fill.
    for (let i = 0; i < rows.length; i += 500) {
      const batch = await db
        .from("trade_fills")
        .upsert(rows.slice(i, i + 500), { onConflict: "owner,id" });
      if (batch.error) throw new Error(batch.error.message);
    }
    fills = rows.length;
  }
  await db
    .from("broker_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      last_statement_date: asOf,
      last_error: null,
    })
    .eq("owner", c.owner);
  return { owner: c.owner, statementDate: asOf, positions: statement.positions.length, fills };
}

async function recordError(owner: string, message: string) {
  await db
    .from("broker_connections")
    .update({ last_synced_at: new Date().toISOString(), last_error: message })
    .eq("owner", owner);
}

async function caller(request: Request): Promise<{ owner: string } | { scheduler: true } | null> {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  if (SYNC_KEY && token === SYNC_KEY) return { scheduler: true };
  const { data } = await db.auth.getUser(token);
  return data.user ? { owner: data.user.id } : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  const who = await caller(request);
  if (!who) return json({ error: "Sign in first." }, 401);
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

  try {
    if ("scheduler" in who) {
      if (request.method !== "POST" || !body.all) return json({ error: "Not found." }, 404);
      const { data } = await db.from("broker_connections").select("*");
      const results = [];
      for (const c of (data ?? []) as Connection[]) {
        try {
          results.push(await syncOwner(c, Boolean(body.force)));
        } catch (e) {
          await recordError(c.owner, (e as Error).message);
          results.push({ owner: c.owner, error: (e as Error).message });
        }
      }
      return json({ results });
    }

    const owner = who.owner;
    if (request.method === "PUT") {
      const positionsQueryId = String(body.positionsQueryId ?? "").trim();
      const tradesQueryId = String(body.tradesQueryId ?? "").trim() || null;
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (!positionsQueryId) return json({ error: "The positions query id is required." }, 400);
      const { data: existing } = await db
        .from("broker_connections")
        .select("token_secret")
        .eq("owner", owner)
        .maybeSingle();
      if (!token && !existing) return json({ error: "A Flex token is required." }, 400);
      let tokenSecret = existing?.token_secret as string | undefined;
      if (token) {
        const put = await db.rpc("broker_token_put", { p_owner: owner, p_token: token });
        if (put.error) throw new Error(put.error.message);
        tokenSecret = put.data as string;
      }
      const row = {
        owner,
        token_secret: tokenSecret,
        positions_query_id: positionsQueryId,
        trades_query_id: tradesQueryId,
        updated_at: new Date().toISOString(),
      };
      const up = await db.from("broker_connections").upsert(row, { onConflict: "owner" });
      if (up.error) throw new Error(up.error.message);
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      await db.rpc("broker_token_delete", { p_owner: owner });
      await db.from("broker_connections").delete().eq("owner", owner);
      return json({ ok: true });
    }
    if (request.method === "POST") {
      const { data } = await db
        .from("broker_connections")
        .select("*")
        .eq("owner", owner)
        .maybeSingle();
      if (!data) return json({ error: "No broker connection yet." }, 404);
      try {
        return json(await syncOwner(data as Connection, true));
      } catch (e) {
        await recordError(owner, (e as Error).message);
        return json({ error: (e as Error).message }, 502);
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
