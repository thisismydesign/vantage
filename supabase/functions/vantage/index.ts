// Vantage API. One Edge Function serves the charts page and agents:
//
//   GET  /?range=1d|24h|1w|history   prices for the caller's list (defaults when anonymous)
//   GET  /?lookup=<query>            symbol search (needs a session)
//   POST /onboard                    create an account for an email; returns a session
//   POST /token                      exchange an agent key for a session
//   GET  /agent (instructions for an agent, from agent.md), GET /openapi.json
//
// Watchlist edits are not here: callers use Supabase's REST layer with their
// session, and row security scopes them to their own rows.
//
// Series are cached per quote symbol in chart_cache; only symbols missing or
// older than the range's TTL go to Yahoo, and the result is written back.

import { createClient } from "npm:@supabase/supabase-js@2";
import { intradayRange, type Chart } from "../_shared/intraday.ts";
import { BASES, convert, convertSeries, type RateBook, type RateSeries } from "../_shared/fx.ts";
import { buildRanges, HISTORY_RANGES, RANGE_SOURCE, thin } from "../_shared/history.ts";
import type { HistoryRange, RangeSeries } from "../../../shared/types.ts";
import { KEY_PREFIX, sha256Hex } from "../_shared/keys.ts";
import { resolveCaller, type Caller } from "./auth.ts";
import { agentInstructions, endpoints, openapi, SITE, type Endpoints } from "./docs.ts";
import {
  addGroup,
  addItem,
  loadList,
  publicList,
  seedDefaults,
  type GroupInput,
  type ItemInput,
} from "./watchlist.ts";

const TTL_MS = { "1d": 60_000, "24h": 60_000, "1w": 60_000, history: 6 * 3_600_000 } as const;
type Range = keyof typeof TTL_MS;
const CONCURRENCY = 6;
const DAY_MS = 86_400_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

type CacheRow = { symbol: string; range: string; fetched_at: string; data: unknown };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// The key the browser and agents send. The runtime's SUPABASE_ANON_KEY is the
// new publishable key; VANTAGE_ANON_KEY pins the one the project accepts.
const ANON_KEY = Deno.env.get("VANTAGE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function yahooChart(
  symbol: string,
  options: { from: number; to?: number; interval: string; includePrePost?: boolean },
): Promise<Chart> {
  const url = new URL(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("period1", String(Math.floor(options.from / 1000)));
  url.searchParams.set("period2", String(Math.floor((options.to ?? Date.now()) / 1000)));
  url.searchParams.set("interval", options.interval);
  url.searchParams.set("includePrePost", String(options.includePrePost ?? false));
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; vantage)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Yahoo responded ${response.status}`);
  const body = await response.json();
  const result = body?.chart?.result?.[0];
  if (!result) throw new Error(body?.chart?.error?.description ?? "No chart data");
  // London quotes arrive in pence (GBp); normalise to pounds like every other listing.
  const pence = result.meta?.currency === "GBp";
  const scale = (value: number | null | undefined) =>
    typeof value === "number" ? (pence ? value / 100 : value) : (value ?? null);
  const closes: (number | null)[] = (result.indicators?.quote?.[0]?.close ?? []).map(scale);
  const regular = result.meta?.currentTradingPeriod?.regular;
  const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
  // tradingPeriods is pre/regular/post arrays per day, or just the regular
  // days. Merge whatever touches into one open stretch per day.
  type Period = { start: number; end: number };
  const raw = result.meta?.tradingPeriods;
  const periods: Period[] = (
    Array.isArray(raw) ? raw.flat() : Object.values(raw ?? {}).flat(2)
  ) as Period[];
  const openPeriods: { start: string; end: string }[] = [];
  for (const p of periods.filter((p) => p && p.end > p.start).sort((a, b) => a.start - b.start)) {
    const last = openPeriods.at(-1);
    if (last && Date.parse(last.end) >= p.start * 1000) {
      if (p.end * 1000 > Date.parse(last.end)) last.end = iso(p.end);
    } else openPeriods.push({ start: iso(p.start), end: iso(p.end) });
  }
  return {
    meta: {
      currency: pence ? "GBP" : result.meta.currency,
      exchangeTimezoneName: result.meta.exchangeTimezoneName,
      previousClose: scale(result.meta.previousClose) ?? undefined,
      openPeriods,
      currentTradingPeriod: regular
        ? { regular: { start: iso(regular.start), end: iso(regular.end) } }
        : undefined,
    },
    quotes: ((result.timestamp ?? []) as number[]).map((t, i) => ({
      date: iso(t),
      close: closes[i] ?? null,
    })),
  };
}

/** Bars as `[key, close]`; daily and weekly bars key by date, intraday ones by time. */
const bars = (chart: Chart, dateOnly: boolean): [string, number][] =>
  chart.quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => [dateOnly ? String(q.date).slice(0, 10) : String(q.date), q.close as number]);
const closes = (chart: Chart) => bars(chart, true);

/** Spans fetched for the history ranges: enough for the longest horizon on each bar size. */
const HOURLY_DAYS = 100;
const DAILY_DAYS = 400;
const WEEKLY_DAYS = 5.2 * 365;

/** Hourly, daily and weekly bars, pre-cut per horizon. */
async function history(symbol: string) {
  const now = Date.now();
  const attempt = async (fn: () => Promise<[string, number][]>) => {
    try {
      return await fn();
    } catch {
      return [] as [string, number][];
    }
  };
  let currency: string | undefined;
  const daily = await attempt(async () => {
    const chart = await yahooChart(symbol, { from: now - DAILY_DAYS * DAY_MS, interval: "1d" });
    currency = chart.meta.currency;
    return closes(chart);
  });
  const weekly = await attempt(async () =>
    closes(await yahooChart(symbol, { from: now - WEEKLY_DAYS * DAY_MS, interval: "1wk" })),
  );
  const hourly = await attempt(async () =>
    bars(await yahooChart(symbol, { from: now - HOURLY_DAYS * DAY_MS, interval: "1h" }), false),
  );
  if (!daily.length && !weekly.length && !hourly.length) throw new Error("No history returned");
  const cut = buildRanges({ hourly, daily, weekly }, now);
  const ranges = Object.fromEntries(
    HISTORY_RANGES.map((r) => [r, { points: cut[r] } satisfies RangeSeries]),
  ) as Record<HistoryRange, RangeSeries>;
  return { symbol, currency, ranges };
}

/** Yahoo quotes `XXX=X` as USD→XXX. Same resolution and span as the tickers of that range. */
const FX_TICKER = (currency: string) => `fx:${currency}`;
async function fxRates(currency: string, range: Range) {
  const symbol = `${currency}=X`;
  const now = Date.now();
  if (range === "history") {
    // Hourly bars convert at their day's rate: a date key sorts before the
    // times of that day, so the daily book serves them too.
    const daily = closes(
      await yahooChart(symbol, { from: now - DAILY_DAYS * DAY_MS, interval: "1d" }),
    );
    const weekly = closes(
      await yahooChart(symbol, { from: now - WEEKLY_DAYS * DAY_MS, interval: "1wk" }),
    );
    return { daily, weekly };
  }
  const chart = await yahooChart(symbol, {
    from: now - (range === "1w" ? 14 : range === "24h" ? 3 : 5) * DAY_MS,
    interval: INTERVAL[range],
  });
  const intraday: RateSeries = chart.quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => [String(q.date), q.close as number]);
  return { intraday: intraday.sort((a, b) => a[0].localeCompare(b[0])) };
}
type FxData = Awaited<ReturnType<typeof fxRates>>;

/** Attach base-currency values to a freshly fetched series, at the rates of each bar's time. */
function withConversions(data: Record<string, unknown>, fx: Map<string, FxData>, range: Range) {
  const book = (pick: (d: FxData) => RateSeries | undefined): RateBook =>
    Object.fromEntries([...fx].map(([c, d]) => [c, pick(d) ?? []]));
  if (range === "history") {
    const ranges = data.ranges as Record<HistoryRange, RangeSeries>;
    const native = (data.currency as string | undefined) ?? "USD";
    return {
      ...data,
      ranges: Object.fromEntries(
        HISTORY_RANGES.map((r) => {
          const weekly = RANGE_SOURCE[r].bars === "weekly";
          const rates = book((d) => (weekly ? d.weekly : d.daily));
          return [r, { ...ranges[r], converted: convertSeries(ranges[r].points, native, rates) }];
        }),
      ),
    };
  }
  const points = data.points as [string, number][];
  const native = data.currency as string;
  const rates = book((d) => d.intraday);
  const previousClose = data.previousClose as number | null;
  const at = (data.previousCloseAt as string | undefined) ?? points[0]?.[0] ?? "";
  return {
    ...data,
    converted: convertSeries(points, native, rates),
    previousCloseConverted: Object.fromEntries(
      BASES.map((base) => [
        base,
        previousClose == null ? null : convert(previousClose, native, base, at, rates),
      ]),
    ),
  };
}

/** Bar sizes that land a regular session near the target point count; 24/7 markets thin further. */
const INTERVAL = { "1d": "5m", "24h": "15m", "1w": "30m" } as const;
const INTERVAL_MINUTES = { "1d": 5, "24h": 15, "1w": 30 } as const;

async function intraday(symbol: string, range: Exclude<Range, "history">) {
  const chart = await yahooChart(symbol, {
    // 5D needs two weeks for five sessions; 24H only the last day or two.
    from: Date.now() - (range === "1w" ? 14 : range === "24h" ? 3 : 5) * DAY_MS,
    interval: INTERVAL[range],
    includePrePost: range === "24h",
  });
  const series = intradayRange(symbol, chart, range);
  const thinned = thin(series.points);
  return {
    ...series,
    points: thinned.points,
    intervalMinutes: INTERVAL_MINUTES[range] * thinned.step,
  };
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i])
          .then((value) => ({ status: "fulfilled", value }) as const)
          .catch((reason) => ({ status: "rejected", reason }) as const);
      }
    }),
  );
  return results;
}

/** Yahoo symbol search, for the editor's "add company" box. */
async function lookup(query: string) {
  const url = new URL("https://query2.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", "8");
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("listsCount", "0");
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; vantage)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Yahoo responded ${response.status}`);
  const body = await response.json();
  type Quote = {
    symbol?: string;
    longname?: string;
    shortname?: string;
    exchDisp?: string;
    exchange?: string;
    quoteType?: string;
  };
  return ((body.quotes ?? []) as Quote[])
    .filter((q) => q.symbol)
    .map((q) => ({
      symbol: q.symbol!,
      name: q.longname ?? q.shortname ?? q.symbol!,
      exchange: q.exchDisp ?? q.exchange ?? "",
      type: q.quoteType ?? "",
    }));
}

/** Prices for every item of a list, served from the cache and refreshed where stale. */
async function prices(range: Range, list: Awaited<ReturnType<typeof loadList>>) {
  const { themes, items } = list;
  const symbols = [...new Set(items.map((i) => i.quote_symbol).filter((s): s is string => !!s))];
  const cached = await db.from("chart_cache").select("*").eq("range", range);
  if (cached.error) throw new Error(cached.error.message);

  const now = Date.now();
  const ttl = TTL_MS[range];
  const cache = new Map((cached.data as CacheRow[]).map((row) => [row.symbol, row]));
  // A row written by an older build, with another shape or a shorter span, counts as stale.
  const usable = (row: CacheRow) => {
    if (range !== "history") return true;
    const data = row.data as { ranges?: unknown; daily?: [string, number][] };
    if (row.symbol.startsWith("fx:"))
      return Boolean(data.daily?.length) && Date.parse(data.daily![0][0]) < now - 380 * DAY_MS;
    return Boolean(data.ranges);
  };
  const expired = (hit: CacheRow | undefined) =>
    !hit || now - Date.parse(hit.fetched_at) > ttl || !usable(hit);
  const stale = symbols.filter((symbol) => expired(cache.get(symbol)));

  const errors: Record<string, string> = {};
  const fetched = await pool(stale, CONCURRENCY, (symbol): Promise<Record<string, unknown>> =>
    range === "history"
      ? history(symbol)
      : (intraday(symbol, range) as Promise<unknown> as Promise<Record<string, unknown>>),
  );
  // Rates for every currency the fresh series quote in, plus the bases. Cached
  // under fx:<currency> with the range's TTL, so a stale rate row refreshes too.
  const fresh = fetched.flatMap((r) =>
    r.status === "fulfilled" ? [r.value as Record<string, unknown>] : [],
  );
  const currencies = [...new Set([...fresh.map((d) => d.currency as string), ...BASES])].filter(
    (c): c is string => Boolean(c) && c !== "USD",
  );
  const fxStale = currencies.filter((c) => expired(cache.get(FX_TICKER(c))));
  const fxFetched = fresh.length ? await pool(fxStale, 3, (c) => fxRates(c, range)) : [];
  const upserts: CacheRow[] = [];
  fxFetched.forEach((result, i) => {
    const symbol = FX_TICKER(fxStale[i]);
    if (result.status === "fulfilled") {
      const row = { symbol, range, fetched_at: new Date(now).toISOString(), data: result.value };
      cache.set(symbol, row);
      upserts.push(row);
    } else errors[symbol] = String(result.reason?.message ?? result.reason);
  });
  const fx = new Map<string, FxData>(
    currencies.flatMap((c) => {
      const hit = cache.get(FX_TICKER(c));
      return hit ? [[c, hit.data as FxData]] : [];
    }),
  );
  fetched.forEach((result, i) => {
    const symbol = stale[i];
    if (result.status === "fulfilled") {
      const data = withConversions(result.value as Record<string, unknown>, fx, range);
      const row = { symbol, range, fetched_at: new Date(now).toISOString(), data };
      cache.set(symbol, row);
      upserts.push(row);
    } else errors[symbol] = String(result.reason?.message ?? result.reason);
  });
  if (upserts.length) {
    const { error } = await db.from("chart_cache").upsert(upserts);
    if (error) console.error("chart_cache upsert failed", error.message);
  }

  const series: Record<string, unknown> = {};
  const fetchedAt: Record<string, string> = {};
  const itemErrors: Record<string, string> = {};
  for (const item of items) {
    const hit = item.quote_symbol ? cache.get(item.quote_symbol) : undefined;
    if (hit) {
      series[item.ticker] = hit.data;
      fetchedAt[item.ticker] = hit.fetched_at;
    }
    if (item.quote_symbol && errors[item.quote_symbol])
      itemErrors[item.ticker] = errors[item.quote_symbol];
  }
  for (const [key, message] of Object.entries(errors))
    if (key.startsWith("fx:")) itemErrors[key] = message;
  return {
    asOf: new Date(now).toISOString(),
    range,
    ttlMs: ttl,
    themes: themes.map((t) => ({ id: t.id, label: t.label })),
    items: items.map((row) => ({
      ticker: row.ticker,
      name: row.name,
      quoteSymbol: row.quote_symbol,
      currency: row.currency,
      themes: row.themes,
      aliases: row.aliases ?? [],
    })),
    series,
    fetchedAt,
    errors: itemErrors,
  };
}

const clientIp = (request: Request) =>
  request.headers.get("cf-connecting-ip") ??
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
  "unknown";

/** Attempts from an address on a route in the last hour, this one included. */
async function throttled(ip: string, route: string, perHour: number) {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db
    .from("throttle")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("route", route)
    .gte("at", since);
  if ((count ?? 0) >= perHour) return true;
  await db.from("throttle").insert({ ip, route });
  return false;
}

/**
 * A session for an existing user: a sign-in token minted with admin rights
 * and verified at once, the same session a magic link would create.
 */
async function mintSession(email: string) {
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(link.error.message);
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const verified = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session)
    throw new Error(verified.error?.message ?? "Could not start a session.");
  const { access_token, refresh_token, expires_at } = verified.data.session;
  return { access_token, refresh_token, expires_at };
}

const TOKEN_LIMIT = { perHour: 60 };

/** A cold agent's way in: its key, hashed, names an owner; the owner gets a session. */
async function token(request: Request, api: Endpoints, ip: string) {
  if (await throttled(ip, "token", TOKEN_LIMIT.perHour))
    return json({ error: "Too many attempts from this address. Try again in an hour." }, 429);
  const key = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith(KEY_PREFIX))
    return json({ error: "Send the agent key as Authorization: Bearer <key>." }, 401);
  const found = await db
    .from("api_keys")
    .select("id,owner")
    .eq("key_hash", await sha256Hex(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (!found.data) return json({ error: "Unknown or revoked key." }, 401);
  const user = await db.auth.admin.getUserById(found.data.owner);
  if (user.error || !user.data.user?.email)
    return json({ error: "The key's owner no longer exists." }, 401);
  const session = await mintSession(user.data.user.email);
  await db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", found.data.id);
  return json({ session, api: endpoints(api) });
}

type OnboardBody = {
  email?: string;
  defaults?: boolean;
  groups?: GroupInput[];
  items?: ItemInput[];
};

/**
 * New accounts only: an existing email never yields a session to an anonymous
 * caller. The agent's session comes from a sign-in token minted with admin
 * rights and verified at once, the same session a magic link would create.
 */
const ONBOARD_LIMIT = { perHour: 5 };

async function onboard(body: OnboardBody, api: Endpoints, ip: string) {
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: "A valid email is required." }, 400);
  // Public endpoint: a few accounts an hour per address is plenty for a person
  // and their agent, and starves anyone trying to flood the user table.
  if (await throttled(ip, "onboard", ONBOARD_LIMIT.perHour))
    return json({ error: "Too many sign-ups from this address. Try again in an hour." }, 429);
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) {
    const taken = /already|exists|registered/i.test(error?.message ?? "");
    return json(
      {
        error: taken
          ? "This email already has an account. Sign in on the site instead."
          : (error?.message ?? "Could not create the account."),
      },
      taken ? 409 : 500,
    );
  }
  const owner = created.user.id;
  // A caller who names their own list gets only that, unless they ask for the defaults too.
  const useDefaults = body.defaults ?? !(body.groups?.length || body.items?.length);
  if (useDefaults) await seedDefaults(db, owner);
  const warnings: string[] = [];
  for (const group of body.groups ?? []) {
    try {
      await addGroup(db, owner, group);
    } catch (e) {
      warnings.push(`group ${group.label}: ${(e as Error).message}`);
    }
  }
  for (const item of body.items ?? []) {
    try {
      await addItem(db, owner, item);
    } catch (e) {
      warnings.push(`item ${item.ticker}: ${(e as Error).message}`);
    }
  }

  const session = await mintSession(email);

  // The human's own sign-in email; the OTP endpoint sends it for an existing user.
  const sent = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: false, options: { email_redirect_to: SITE } }),
  });
  return json(
    {
      email,
      session,
      signInEmailSent: sent.ok,
      warnings,
      list: publicList(await loadList(db, owner)),
      api: endpoints(api),
    },
    201,
  );
}

/**
 * Supabase only hands its generated REST description to the service role, so
 * relay it, trimmed to the tables a session may touch, with the auth it omits.
 */
async function restOpenapi(api: Endpoints) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`REST description unavailable (${response.status})`);
  const spec = (await response.json()) as {
    paths?: Record<string, unknown>;
    definitions?: Record<string, unknown>;
  };
  const keep = new Set([
    "watchlist",
    "watchlist_themes",
    "events",
    "news",
    "portfolio_snapshots",
    "snapshot_positions",
    "rpc/put_portfolio_snapshot",
    "nav_history",
    "trade_fills",
  ]);
  const pick = (o: Record<string, unknown> | undefined, strip: (k: string) => string) =>
    Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => keep.has(strip(k))));
  const u = endpoints(api);
  const rest = new URL(u.rest);
  return {
    ...spec,
    // PostgREST describes itself from inside the stack; callers go through the gateway.
    host: rest.host,
    basePath: rest.pathname,
    schemes: [rest.protocol.replace(":", "")],
    info: {
      title: "Vantage data",
      version: "1",
      description:
        "The user's own rows. Upsert with POST ?on_conflict=<the table's upsert columns> and header Prefer: resolution=merge-duplicates.",
    },
    securityDefinitions: {
      apikey: {
        type: "apiKey",
        in: "header",
        name: "apikey",
        description: `Always ${api.anonKey}`,
      },
      session: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description: `Bearer <access_token>; see ${u.openapi} for getting a session`,
      },
    },
    security: [{ apikey: [], session: [] }],
    paths: pick(spec.paths, (k) => k.replace(/^\//, "")),
    definitions: pick(spec.definitions, (k) => k),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const text = (body: string, type: string) =>
  new Response(body, {
    status: 200,
    headers: { ...CORS, "Content-Type": type, "Cache-Control": "no-store" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(request.url);
  // Supabase mounts the function at /functions/v1/vantage; routes are relative to it.
  const route = url.pathname.replace(/^\/vantage/, "").replace(/\/$/, "") || "/";
  const api: Endpoints = {
    // The gateway terminates TLS, so the runtime sees http; the public URL is https.
    base: `https://${url.host}/functions/v1/vantage`,
    supabase: SUPABASE_URL,
    anonKey: ANON_KEY,
  };
  const method = request.method;

  try {
    if (route === "/agent" && method === "GET")
      return text(await agentInstructions(api), "text/markdown; charset=utf-8");
    if (route === "/openapi.json" && method === "GET") return json(openapi(api));
    if (route === "/rest-openapi.json" && method === "GET") return json(await restOpenapi(api));
    if (route === "/onboard" && method === "POST") {
      const body = ((await request.json().catch(() => ({}))) ?? {}) as OnboardBody;
      return await onboard(body, api, clientIp(request));
    }
    if (route === "/token" && method === "POST")
      return await token(request, api, clientIp(request));
    if (route !== "/") return json({ error: "Not found." }, 404);
    if (method !== "GET") return json({ error: "GET only." }, 405);

    const caller: Caller = await resolveCaller(db, request);
    const owner = caller.via === "none" ? null : caller.owner;
    const query = url.searchParams.get("lookup");
    if (query)
      return owner
        ? json({ results: await lookup(query) })
        : json({ error: "Sign in first." }, 401);
    const range = url.searchParams.get("range") ?? "1d";
    if (!(range in TTL_MS)) return json({ error: "Unsupported range." }, 400);
    return json(await prices(range as Range, await loadList(db, owner)));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
