// Watchlist edits go through Supabase's REST layer; row security scopes them to the caller.

import { createClient } from "npm:@supabase/supabase-js@2";
import { intradayRange, type Chart } from "../_shared/intraday.ts";
import { convert, convertSeries, type RateBook, type RateSeries } from "../_shared/fx.ts";
import { buildRanges, thin } from "../_shared/history.ts";
import {
  BASES,
  type BaseCurrency,
  type ChartRange,
  type ChartsResponse,
  type HistoryRange,
  type IntradaySeries,
  type LookupResponse,
  type RangeSeries,
  type SymbolMatch,
  type VantageHistory,
} from "../../../shared/api.ts";
import { KEY_PREFIX, sha256Hex } from "../../../shared/keys.ts";
import { HISTORY_RANGES, RANGE_SOURCE } from "../../../shared/ranges.ts";
import { resolveCaller, type Caller } from "./auth.ts";
import { agentInstructions, endpoints, openapi, type Endpoints } from "./docs.ts";
import {
  addGroup,
  addItem,
  loadList,
  publicList,
  seedDefaults,
  type GroupInput,
  type ItemInput,
} from "./watchlist.ts";

const TTL_MS: Record<ChartRange, number> = {
  "1d": 60_000,
  "24h": 60_000,
  "1w": 60_000,
  history: 6 * 3_600_000,
};
const CONCURRENCY = 6;
const DAY_MS = 86_400_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

type CacheRow = { symbol: string; range: string; fetched_at: string; data: unknown };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// The runtime's SUPABASE_ANON_KEY is the new publishable key; VANTAGE_ANON_KEY pins the one the project accepts.
const ANON_KEY = Deno.env.get("VANTAGE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = Deno.env.get("VANTAGE_SITE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Period = { start: number; end: number };
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

function mergeTouching(periods: Period[]) {
  const merged: { start: string; end: string }[] = [];
  for (const p of periods.filter((p) => p && p.end > p.start).sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && Date.parse(last.end) >= p.start * 1000) {
      if (p.end * 1000 > Date.parse(last.end)) last.end = iso(p.end);
    } else merged.push({ start: iso(p.start), end: iso(p.end) });
  }
  return merged;
}

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
  // London quotes arrive in pence (GBp).
  const pence = result.meta?.currency === "GBp";
  const scale = (value: number | null | undefined) =>
    typeof value === "number" ? (pence ? value / 100 : value) : (value ?? null);
  const closes: (number | null)[] = (result.indicators?.quote?.[0]?.close ?? []).map(scale);
  const regular = result.meta?.currentTradingPeriod?.regular;
  // tradingPeriods is pre/regular/post arrays per day, or just the regular days.
  const raw = result.meta?.tradingPeriods;
  const periods: Period[] = (
    Array.isArray(raw) ? raw.flat() : Object.values(raw ?? {}).flat(2)
  ) as Period[];
  return {
    meta: {
      currency: pence ? "GBP" : result.meta.currency,
      exchangeTimezoneName: result.meta.exchangeTimezoneName,
      previousClose: scale(result.meta.previousClose) ?? undefined,
      openPeriods: mergeTouching(periods),
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

const bars = (chart: Chart, dateOnly: boolean): [string, number][] =>
  chart.quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => [dateOnly ? String(q.date).slice(0, 10) : String(q.date), q.close as number]);
const closes = (chart: Chart) => bars(chart, true);

// Enough for the longest horizon on each bar size.
const HOURLY_DAYS = 100;
const DAILY_DAYS = 400;
const WEEKLY_DAYS = 5.2 * 365;

async function history(symbol: string): Promise<VantageHistory> {
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

const FX_PREFIX = "fx:";
const fxCacheKey = (currency: string) => `${FX_PREFIX}${currency}`;
async function fxRates(currency: string, range: ChartRange) {
  // Yahoo quotes `XXX=X` as USD→XXX.
  const symbol = `${currency}=X`;
  const now = Date.now();
  if (range === "history") {
    // Hourly bars convert at their day's rate: a date key sorts before that day's times, so the daily book serves them.
    const daily = closes(
      await yahooChart(symbol, { from: now - DAILY_DAYS * DAY_MS, interval: "1d" }),
    );
    const weekly = closes(
      await yahooChart(symbol, { from: now - WEEKLY_DAYS * DAY_MS, interval: "1wk" }),
    );
    return { daily, weekly };
  }
  const chart = await yahooChart(symbol, {
    from: now - LOOKBACK_DAYS[range] * DAY_MS,
    interval: INTERVAL[range],
  });
  const intraday: RateSeries = chart.quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => [String(q.date), q.close as number]);
  return { intraday: intraday.sort((a, b) => a[0].localeCompare(b[0])) };
}
type FxData = Awaited<ReturnType<typeof fxRates>>;

type Series = IntradaySeries | VantageHistory;

function withConversions(data: Series, fx: Map<string, FxData>): Series {
  const book = (pick: (d: FxData) => RateSeries | undefined): RateBook =>
    Object.fromEntries([...fx].map(([c, d]) => [c, pick(d) ?? []]));
  if ("ranges" in data) {
    const native = data.currency ?? "USD";
    return {
      ...data,
      ranges: Object.fromEntries(
        HISTORY_RANGES.map((r) => {
          const weekly = RANGE_SOURCE[r].bars === "weekly";
          const rates = book((d) => (weekly ? d.weekly : d.daily));
          const series = data.ranges[r];
          return [r, { ...series, converted: convertSeries(series.points, native, rates) }];
        }),
      ) as Record<HistoryRange, RangeSeries>,
    };
  }
  const { points, currency: native, previousClose } = data;
  const rates = book((d) => d.intraday);
  const at = data.previousCloseAt ?? points[0]?.[0] ?? "";
  return {
    ...data,
    converted: convertSeries(points, native, rates),
    previousCloseConverted: Object.fromEntries(
      BASES.map((base) => [
        base,
        previousClose == null ? null : convert(previousClose, native, base, at, rates),
      ]),
    ) as Record<BaseCurrency, number | null>,
  };
}

// Sized so a regular session lands near the target point count; 24/7 markets thin further.
const INTERVAL = { "1d": "5m", "24h": "15m", "1w": "30m" } as const;
const INTERVAL_MINUTES = { "1d": 5, "24h": 15, "1w": 30 } as const;
// 1w's five sessions can take two weeks.
const LOOKBACK_DAYS = { "1d": 5, "24h": 3, "1w": 14 } as const;

async function intraday(
  symbol: string,
  range: Exclude<ChartRange, "history">,
): Promise<IntradaySeries> {
  const chart = await yahooChart(symbol, {
    from: Date.now() - LOOKBACK_DAYS[range] * DAY_MS,
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

async function searchSymbols(query: string): Promise<SymbolMatch[]> {
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

async function prices(
  range: ChartRange,
  list: Awaited<ReturnType<typeof loadList>>,
): Promise<ChartsResponse> {
  const { themes, items } = list;
  const symbols = [...new Set(items.map((i) => i.quote_symbol).filter((s): s is string => !!s))];
  const cached = await db.from("chart_cache").select("*").eq("range", range);
  if (cached.error) throw new Error(cached.error.message);

  const now = Date.now();
  const ttl = TTL_MS[range];
  const cache = new Map((cached.data as CacheRow[]).map((row) => [row.symbol, row]));
  // Rows written by older builds may have another shape or a shorter span.
  const usable = (row: CacheRow) => {
    if (range !== "history") return true;
    const data = row.data as { ranges?: unknown; daily?: [string, number][] };
    if (row.symbol.startsWith(FX_PREFIX))
      return Boolean(data.daily?.length) && Date.parse(data.daily![0][0]) < now - 380 * DAY_MS;
    return Boolean(data.ranges);
  };
  const expired = (hit: CacheRow | undefined) =>
    !hit || now - Date.parse(hit.fetched_at) > ttl || !usable(hit);
  const stale = symbols.filter((symbol) => expired(cache.get(symbol)));

  const errors: Record<string, string> = {};
  const fetched = await pool(stale, CONCURRENCY, (symbol): Promise<Series> =>
    range === "history" ? history(symbol) : intraday(symbol, range),
  );
  const fresh = fetched.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const currencies = [...new Set([...fresh.map((d) => d.currency), ...BASES])].filter(
    (c): c is string => Boolean(c) && c !== "USD",
  );
  const fxStale = currencies.filter((c) => expired(cache.get(fxCacheKey(c))));
  const fxFetched = fresh.length ? await pool(fxStale, 3, (c) => fxRates(c, range)) : [];
  const upserts: CacheRow[] = [];
  fxFetched.forEach((result, i) => {
    const symbol = fxCacheKey(fxStale[i]);
    if (result.status === "fulfilled") {
      const row = { symbol, range, fetched_at: new Date(now).toISOString(), data: result.value };
      cache.set(symbol, row);
      upserts.push(row);
    } else errors[symbol] = String(result.reason?.message ?? result.reason);
  });
  const fx = new Map<string, FxData>(
    currencies.flatMap((c) => {
      const hit = cache.get(fxCacheKey(c));
      return hit ? [[c, hit.data as FxData]] : [];
    }),
  );
  fetched.forEach((result, i) => {
    const symbol = stale[i];
    if (result.status === "fulfilled") {
      const data = withConversions(result.value, fx);
      const row = { symbol, range, fetched_at: new Date(now).toISOString(), data };
      cache.set(symbol, row);
      upserts.push(row);
    } else errors[symbol] = String(result.reason?.message ?? result.reason);
  });
  if (upserts.length) {
    const { error } = await db.from("chart_cache").upsert(upserts);
    if (error) console.error("chart_cache upsert failed", error.message);
  }

  const series: ChartsResponse["series"] = {};
  const fetchedAt: Record<string, string> = {};
  const itemErrors: Record<string, string> = {};
  for (const item of items) {
    const hit = item.quote_symbol ? cache.get(item.quote_symbol) : undefined;
    if (hit) {
      series[item.ticker] = hit.data as Series;
      fetchedAt[item.ticker] = hit.fetched_at;
    }
    if (item.quote_symbol && errors[item.quote_symbol])
      itemErrors[item.ticker] = errors[item.quote_symbol];
  }
  for (const [key, message] of Object.entries(errors))
    if (key.startsWith(FX_PREFIX)) itemErrors[key] = message;
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

async function throttled(ip: string, route: string, perHour: number) {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  // Only the last hour counts, so older rows go; the table stays an hour long.
  await db.from("throttle").delete().lt("at", since);
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

async function exchangeAgentKey(request: Request, api: Endpoints, ip: string) {
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

// A few accounts an hour per address suffices for a person and their agent, and starves anyone flooding the user table.
const ONBOARD_LIMIT = { perHour: 5 };

// New accounts only: an existing email never yields a session to an anonymous caller.
async function onboard(body: OnboardBody, api: Endpoints, ip: string) {
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: "A valid email is required." }, 400);
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
  const namesOwnList = Boolean(body.groups?.length || body.items?.length);
  const useDefaults = body.defaults ?? !namesOwnList;
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

  const signInEmail = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: false, options: { email_redirect_to: api.site } }),
  });
  return json(
    {
      email,
      session,
      signInEmailSent: signInEmail.ok,
      warnings,
      list: publicList(await loadList(db, owner)),
      api: endpoints(api),
    },
    201,
  );
}

type RestSpec = { paths?: Record<string, unknown>; definitions?: Record<string, unknown> };

// The schema changes only with a migration, and every deploy starts fresh instances; the TTL covers migrations pushed on their own.
const REST_SPEC_TTL_MS = 10 * 60_000;
let restSpec: { at: number; spec: Promise<RestSpec> } | undefined;

// Supabase serves its generated REST description only to the service role.
function fetchRestSpec(): Promise<RestSpec> {
  if (restSpec && Date.now() - restSpec.at < REST_SPEC_TTL_MS) return restSpec.spec;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const spec = fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`REST description unavailable (${response.status})`);
    return (await response.json()) as RestSpec;
  });
  restSpec = { at: Date.now(), spec };
  spec.catch(() => (restSpec = undefined));
  return spec;
}

async function restOpenapi(api: Endpoints) {
  const spec = await fetchRestSpec();
  const sessionPaths = new Set([
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
    Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => sessionPaths.has(strip(k))));
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

// Signed out, the app never refreshes on its own; a page view costs one to three requests.
const SIGNED_OUT_LIMIT = { perHour: 60, symbols: 25 };
const SYMBOL = /^[A-Za-z0-9.^=-]{1,20}$/;

/** A bare list for symbols a signed-out caller names; each prices under its own symbol. */
const symbolList = (symbols: string[]) => ({
  themes: [],
  items: symbols.map((symbol, position) => ({
    ticker: symbol,
    name: symbol,
    quote_symbol: symbol,
    currency: null,
    themes: [],
    aliases: [],
    disabled: false,
    position,
  })),
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
    site: SITE,
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
      return await exchangeAgentKey(request, api, clientIp(request));
    if (route !== "/") return json({ error: "Not found." }, 404);
    if (method !== "GET") return json({ error: "GET only." }, 405);

    const caller: Caller = await resolveCaller(db, request);
    const owner = caller.via === "none" ? null : caller.owner;
    const query = url.searchParams.get("lookup");
    if (query)
      return owner
        ? json({ results: await searchSymbols(query) } satisfies LookupResponse)
        : json({ error: "Sign in first." }, 401);
    const range = url.searchParams.get("range") ?? "1d";
    if (!(range in TTL_MS)) return json({ error: "Unsupported range." }, 400);
    if (owner) return json(await prices(range as ChartRange, await loadList(db, owner)));
    // Signed out, only the symbols asked for: a few, well-formed, and rate-limited per address.
    const symbols = [
      ...new Set((url.searchParams.get("symbols") ?? "").split(",").filter(Boolean)),
    ];
    if (
      !symbols.length ||
      symbols.length > SIGNED_OUT_LIMIT.symbols ||
      !symbols.every((s) => SYMBOL.test(s))
    )
      return json({ error: `Sign in, or name up to ${SIGNED_OUT_LIMIT.symbols} symbols.` }, 400);
    if (await throttled(clientIp(request), "signed-out", SIGNED_OUT_LIMIT.perHour))
      return json({ error: "Too many requests from this address. Try again later." }, 429);
    return json(await prices(range as ChartRange, symbolList(symbols)));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
