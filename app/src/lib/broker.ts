// Broker data for a signed-in owner: the connection, the latest positions
// snapshot and every fill, read through row security; plus the pure builders
// that turn them into the Portfolio and Trades shapes the pages render.

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type {
  BaseCurrency,
  IntradaySeries,
  Portfolio,
  Position,
  VantageHistory,
  TradeClose,
  TradeFill,
  TradesFile,
} from "@shared/types.ts";
import { buildNames } from "./trades/names.ts";
import { buildRoundTrips } from "./trades/roundtrips.ts";
import { BROKER_BASE, type ChartItem, type ChartTheme } from "./api.ts";
import { supabase } from "./supabase.ts";

/** Fired on `window` after the connection or its data changed. */
export const BROKER_CHANGED = "vantage:broker-changed";

/** Mirrors the Flex shapes the sync function stores (supabase/functions/_shared/flex.ts). */
export type FlexPosition = {
  accountId: string;
  symbol: string;
  description: string;
  currency: string;
  assetCategory: string;
  quantity: number;
  markPrice: number | null;
  positionValue: number | null;
  costBasisMoney: number | null;
  unrealizedPnl: number | null;
  fxRateToBase: number | null;
};
export type FlexTrade = {
  accountId: string;
  conid: string;
  symbol: string;
  description: string;
  assetCategory: string;
  currency: string;
  fxRateToBase: number | null;
  tradeId: string;
  dateTime: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  proceeds: number;
  commission: number;
  netCash: number;
  fifoPnlRealized: number | null;
  openClose: string | null;
};

export type Connection = {
  positions_query_id: string;
  trades_query_id: string | null;
  last_synced_at: string | null;
  last_statement_date: string | null;
  last_error: string | null;
};
export type Snapshot = {
  as_of: string;
  account_id: string | null;
  base_currency: string | null;
  nav: number | null;
  cash: number | null;
  positions: FlexPosition[];
  fetched_at: string;
};
export type FillRow = { id: string; data: FlexTrade };

export type BrokerData = {
  connection: Connection | null;
  snapshot: Snapshot | null;
  fills: FillRow[];
  loading: boolean;
  error?: string;
};

const EMPTY: BrokerData = { connection: null, snapshot: null, fills: [], loading: false };

export function useBrokerData(session: Session | null): BrokerData {
  const [data, setData] = useState<BrokerData>(EMPTY);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(BROKER_CHANGED, bump);
    return () => window.removeEventListener(BROKER_CHANGED, bump);
  }, []);
  useEffect(() => {
    if (!session || !supabase) {
      setData(EMPTY);
      return;
    }
    let disposed = false;
    setData((d) => ({ ...d, loading: true }));
    (async () => {
      const connection = await supabase
        .from("broker_connections")
        .select("positions_query_id,trades_query_id,last_synced_at,last_statement_date,last_error")
        .maybeSingle();
      const snapshot = await supabase
        .from("portfolio_snapshots")
        .select("as_of,account_id,base_currency,nav,cash,positions,fetched_at")
        .order("as_of", { ascending: false })
        .limit(1)
        .maybeSingle();
      // PostgREST pages at a thousand rows; a few years of fills exceed that.
      const fills: FillRow[] = [];
      for (let from = 0; ; from += 1000) {
        const page = await supabase
          .from("trade_fills")
          .select("id,data")
          .order("traded_at")
          .range(from, from + 999);
        if (page.error) throw new Error(page.error.message);
        fills.push(...((page.data ?? []) as FillRow[]));
        if ((page.data?.length ?? 0) < 1000) break;
      }
      if (disposed) return;
      setData({
        connection: (connection.data as Connection | null) ?? null,
        snapshot: (snapshot.data as Snapshot | null) ?? null,
        fills,
        loading: false,
        error: connection.error?.message ?? snapshot.error?.message,
      });
    })().catch((e) => {
      if (!disposed) setData({ ...EMPTY, error: (e as Error).message });
    });
    return () => {
      disposed = true;
    };
  }, [session, version]);
  return data;
}

async function call(accessToken: string, init: RequestInit) {
  const response = await fetch(BROKER_BASE, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error ?? response.statusText));
  return body;
}

export const saveConnection = (
  accessToken: string,
  input: { token?: string; positionsQueryId: string; tradesQueryId?: string },
) => call(accessToken, { method: "PUT", body: JSON.stringify(input) });
export const removeConnection = (accessToken: string) => call(accessToken, { method: "DELETE" });
export const syncNow = (accessToken: string) => call(accessToken, { method: "POST", body: "{}" });

// ---------------------------------------------------------------- builders

/** A broker symbol to a watchlist ticker: ticker, quote symbol (with or without suffix) or alias. */
export function resolver(items: ChartItem[]): (symbol: string) => string {
  const index = new Map<string, string>();
  for (const item of items) {
    index.set(item.ticker.toUpperCase(), item.ticker);
    if (item.quoteSymbol) {
      index.set(item.quoteSymbol.toUpperCase(), item.ticker);
      index.set(item.quoteSymbol.split(".")[0].toUpperCase(), item.ticker);
    }
    for (const alias of item.aliases ?? []) index.set(alias.toUpperCase(), item.ticker);
  }
  return (symbol) =>
    index.get(symbol.toUpperCase()) ?? index.get(symbol.split(".")[0].toUpperCase()) ?? symbol;
}

/** Latest price for a ticker from the charts' 1D series: native, and the rate to `base`. */
export type Pricing = (ticker: string) => {
  price: number;
  currency: string;
  /** Base-currency units per unit of `currency` at that bar. */
  rate: number | null;
  priceBase: number | null;
  previousClose: number | null;
  asOf: string;
} | null;

export function pricingFrom(
  series: Record<string, IntradaySeries | VantageHistory> | undefined,
  base: BaseCurrency,
): Pricing {
  return (ticker) => {
    const s = series?.[ticker];
    if (!s || !("points" in s) || !s.points.length) return null;
    const i = s.points.length - 1;
    const [asOf, price] = s.points[i];
    const converted = s.currency === base ? price : (s.converted?.[base]?.[i] ?? null);
    return {
      price,
      currency: s.currency,
      rate: converted != null && price ? converted / price : null,
      priceBase: converted,
      previousClose: s.previousClose,
      asOf,
    };
  };
}

export type Built = {
  portfolio: Portfolio;
  /** Day change per ticker, from the quote that priced it. */
  changes: Record<string, number | null>;
  quoteAsOf: string | null;
};

export function buildPortfolio(
  snapshot: Snapshot,
  items: ChartItem[],
  themes: ChartTheme[],
  pricing: Pricing,
  base: BaseCurrency,
): Built {
  const resolve = resolver(items);
  const warnings: string[] = [];
  const changes: Record<string, number | null> = {};
  let quoteAsOf: string | null = null;
  const positions: Position[] = [];
  for (const p of snapshot.positions) {
    if (p.quantity === 0) continue;
    const ticker = resolve(p.symbol);
    const quote = pricing(ticker);
    let priced: Pick<Position, "price" | "value" | "valueBase" | "currency" | "priceSource">;
    if (quote && quote.priceBase != null) {
      if (quote.currency !== p.currency)
        warnings.push(
          `${ticker} is held in ${p.currency} but priced off its ${quote.currency} listing; it will not tie out exactly against the broker.`,
        );
      priced = {
        price: quote.price,
        value: quote.price * p.quantity,
        valueBase: quote.priceBase * p.quantity,
        currency: quote.currency,
        priceSource: "quote",
      };
      changes[ticker] = quote.previousClose ? quote.price / quote.previousClose - 1 : null;
      if (!quoteAsOf || quote.asOf > quoteAsOf) quoteAsOf = quote.asOf;
    } else {
      const rate = p.fxRateToBase ?? (p.currency === base ? 1 : null);
      if (rate == null) warnings.push(`No ${p.currency} rate for ${ticker}; excluded from totals.`);
      priced = {
        price: p.markPrice,
        value: p.positionValue,
        valueBase: rate != null && p.positionValue != null ? p.positionValue * rate : null,
        currency: p.currency,
        priceSource: "broker",
      };
      changes[ticker] = null;
    }
    const rate = p.fxRateToBase ?? (p.currency === base ? 1 : null);
    positions.push({
      ticker,
      name: p.description || undefined,
      source: "ibkr",
      account: p.accountId,
      quantity: p.quantity,
      ...priced,
      costBasis: p.costBasisMoney,
      costBasisBase: rate != null && p.costBasisMoney != null ? p.costBasisMoney * rate : null,
      unrealizedPnl: p.unrealizedPnl,
      asOf: snapshot.as_of,
    });
  }
  const total = positions.reduce((s, p) => s + (p.valueBase ?? 0), 0);
  const withCost = positions.filter((p) => p.costBasisBase != null);
  const costBasis = withCost.reduce((s, p) => s + (p.costBasisBase ?? 0), 0);
  const costBasisCoverage = withCost.reduce((s, p) => s + (p.valueBase ?? 0), 0);
  const themeOf = new Map(items.map((i) => [i.ticker, i.themes]));
  const byTheme = new Map<string, number>();
  for (const p of positions) {
    const key = themeOf.get(p.ticker)?.[0] ?? "unclassified";
    byTheme.set(key, (byTheme.get(key) ?? 0) + (p.valueBase ?? 0));
  }
  const held = new Set(positions.map((p) => p.ticker));
  const cash =
    snapshot.cash != null
      ? { value: snapshot.cash, asOf: snapshot.as_of, source: "ibkr" as const }
      : null;
  return {
    portfolio: {
      asOf: snapshot.as_of,
      baseCurrency: base,
      positions: positions.sort((a, b) => (b.valueBase ?? 0) - (a.valueBase ?? 0)),
      cash,
      brokerNav: snapshot.nav != null ? { value: snapshot.nav, asOf: snapshot.as_of } : null,
      totals: {
        value: total,
        netValue: total + (cash?.value ?? 0),
        costBasis,
        costBasisCoverage,
        byTheme: [...byTheme.entries()]
          .map(([theme, value]) => ({
            theme,
            label: themes.find((t) => t.id === theme)?.label ?? "Unclassified",
            value,
            share: total ? value / total : 0,
          }))
          .sort((a, b) => b.value - a.value),
        bySource: [{ source: "ibkr", value: total }],
      },
      watchOnly: items.filter((i) => !held.has(i.ticker)).map((i) => i.ticker),
      warnings: [...new Set(warnings)],
    },
    changes,
    quoteAsOf,
  };
}

export function buildTrades(rows: FillRow[], items: ChartItem[], base: BaseCurrency): TradesFile {
  const resolve = resolver(items);
  const warnings: string[] = [];
  const missingFx = new Set<string>();
  const byId = new Map(rows.map((r) => [r.id, r.data]));
  let from = "";
  let to = "";
  const fills: TradeFill[] = rows.map(({ id, data: t }) => {
    const day = t.dateTime.slice(0, 10);
    if (day && (!from || day < from)) from = day;
    if (day && (!to || day > to)) to = day;
    return {
      id,
      ticker: resolve(t.symbol),
      symbol: t.symbol,
      description: t.description,
      assetCategory: t.assetCategory,
      account: t.accountId,
      dateTime: t.dateTime,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
      currency: t.currency,
      fxRateToBase: t.fxRateToBase ?? (t.currency === base ? 1 : null),
      proceeds: t.proceeds,
      commission: t.commission,
      netCash: t.netCash,
      brokerPnl: t.fifoPnlRealized,
      openClose: t.openClose,
    };
  });
  const toBase = (fill: TradeFill, value: number) => {
    if (fill.fxRateToBase !== null) return value * fill.fxRateToBase;
    missingFx.add(fill.currency);
    return 0;
  };
  const keyOf = (f: TradeFill) =>
    `${f.account}:${byId.get(f.id)?.conid || `${f.symbol}:${f.currency}`}`;
  const today = new Date().toISOString().slice(0, 10);
  const roundTrips = buildRoundTrips(fills, keyOf, toBase, today);
  for (const c of missingFx)
    warnings.push(
      `No ${c}→${base} rate on the statement; ${c} trades count as zero in base terms.`,
    );
  const truncated = roundTrips.filter((r) => r.truncated).length;
  if (truncated)
    warnings.push(
      `${truncated} round trips were already open before ${from} and are excluded from the statistics.`,
    );
  const closes: TradeClose[] = fills
    .filter((f) => /^C/.test(f.openClose ?? "") || (f.brokerPnl !== null && f.brokerPnl !== 0))
    .map((f) => {
      const pnl = f.brokerPnl ?? 0;
      const cost = Math.abs(f.netCash - pnl);
      return {
        id: f.id,
        ticker: f.ticker,
        symbol: f.symbol,
        currency: f.currency,
        direction: f.quantity < 0 ? "long" : "short",
        dateTime: f.dateTime,
        quantity: Math.abs(f.quantity),
        price: f.price,
        cost,
        pnl,
        pnlBase: toBase(f, pnl),
        costBase: toBase(f, cost),
        returnPct: cost ? pnl / cost : 0,
      };
    });
  const names = buildNames(
    fills,
    closes,
    keyOf,
    (key) => {
      const trips = roundTrips.filter((r) => r.id.startsWith(`${key}-`));
      return { count: trips.length, truncated: trips.some((r) => r.truncated) };
    },
    toBase,
  );
  return {
    asOf: today,
    baseCurrency: base,
    from,
    to,
    fills: fills.sort((a, b) => a.dateTime.localeCompare(b.dateTime) || a.id.localeCompare(b.id)),
    roundTrips,
    closes,
    names,
    sources: [],
    warnings,
  };
}
