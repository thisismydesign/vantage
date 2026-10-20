import { intradayRange, type Chart } from "./intraday.ts";
import { convert, convertSeries, type RateBook, type RateSeries } from "./fx.ts";
import { buildRanges, thin } from "./history.ts";
import { db } from "./db.ts";
import type { loadList } from "./watchlist.ts";
import {
  BASES,
  type BaseCurrency,
  type ChartRange,
  type ChartsResponse,
  type HistoryRange,
  type IntradaySeries,
  type RangeSeries,
  type VantageHistory,
} from "../../../shared/api.ts";
import { HISTORY_RANGES, RANGE_SOURCE } from "../../../shared/ranges.ts";

type List = Awaited<ReturnType<typeof loadList>>;

export const TTL_MS: Record<ChartRange, number> = {
  "1d": 60_000,
  "24h": 60_000,
  "1w": 60_000,
  history: 6 * 3_600_000,
};
const CONCURRENCY = 6;
const DAY_MS = 86_400_000;

export const isChartRange = (range: string): range is ChartRange => range in TTL_MS;

type CacheRow = { symbol: string; range: string; fetched_at: string; data: unknown };

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
  const current = result.meta?.currentTradingPeriod;
  const hours = (period: Period) => ({ start: iso(period.start), end: iso(period.end) });
  // tradingPeriods is pre/regular/post arrays per day, or just the regular days.
  const raw = result.meta?.tradingPeriods;
  const periods: Period[] = (
    Array.isArray(raw) ? raw.flat() : Object.values(raw ?? {}).flat(2)
  ) as Period[];
  const regularPeriods: Period[] = (Array.isArray(raw) ? raw : (raw?.regular ?? [])).flat();
  return {
    meta: {
      currency: pence ? "GBP" : result.meta.currency,
      exchangeTimezoneName: result.meta.exchangeTimezoneName,
      previousClose: scale(result.meta.previousClose) ?? undefined,
      openPeriods: mergeTouching(periods),
      regularPeriods: mergeTouching(regularPeriods),
      currentTradingPeriod: current?.regular
        ? current.pre && current.post
          ? {
              pre: hours(current.pre),
              regular: hours(current.regular),
              post: hours(current.post),
            }
          : { regular: hours(current.regular) }
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
    includePrePost: range !== "1w",
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

export async function prices(range: ChartRange, list: List): Promise<ChartsResponse> {
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
