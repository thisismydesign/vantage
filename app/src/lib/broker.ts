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
import type { ChartItem, ChartTheme } from "./api.ts";
import { supabase } from "./supabase.ts";

export type PositionRow = {
  account_id: string | null;
  symbol: string;
  description: string;
  asset_category: string;
  currency: string;
  quantity: number;
  mark_price: number | null;
  position_value: number | null;
  cost_basis: number | null;
  unrealized_pnl: number | null;
  fx_rate_to_base: number | null;
};
/** `traded_at` is the exchange's wall time, without a zone. */
export type FillRow = {
  id: string;
  traded_at: string;
  account_id: string | null;
  conid: string | null;
  symbol: string;
  description: string;
  asset_category: string;
  currency: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  proceeds: number;
  commission: number;
  net_cash: number;
  fx_rate_to_base: number | null;
  broker_pnl: number | null;
  open_close: string | null;
};
const POSITION_COLUMNS =
  "account_id,symbol,description,asset_category,currency,quantity,mark_price,position_value,cost_basis,unrealized_pnl,fx_rate_to_base";
const FILL_COLUMNS =
  "id,traded_at,account_id,conid,symbol,description,asset_category,currency,side,quantity,price,proceeds,commission,net_cash,fx_rate_to_base,broker_pnl,open_close";

export type Snapshot = {
  as_of: string;
  account_id: string | null;
  base_currency: string | null;
  nav: number | null;
  cash: number | null;
  positions: PositionRow[];
  fetched_at: string;
};

/** Base currency. */
export type NavRow = { as_of: string; nav: number; cash: number | null };

export type BrokerData = {
  snapshot: Snapshot | null;
  /** Oldest first. */
  history: NavRow[];
  fills: FillRow[];
  loading: boolean;
  error?: string;
};

const EMPTY: BrokerData = { snapshot: null, history: [], fills: [], loading: false };

export function useBrokerData(session: Session | null): BrokerData {
  const [data, setData] = useState<BrokerData>(EMPTY);
  useEffect(() => {
    if (!session || !supabase) {
      setData(EMPTY);
      return;
    }
    let disposed = false;
    setData((d) => ({ ...d, loading: true }));
    (async () => {
      const snapshot = await supabase
        .from("portfolio_snapshots")
        .select(
          `as_of,account_id,base_currency,nav,cash,fetched_at,positions:snapshot_positions(${POSITION_COLUMNS})`,
        )
        .order("as_of", { ascending: false })
        .limit(1)
        .maybeSingle();
      // PostgREST caps a response at a thousand rows; a few years of fills or days exceed that.
      const all = async <T>(table: string, columns: string, order: string[]) => {
        const rows: T[] = [];
        for (let from = 0; ; from += 1000) {
          let query = supabase!.from(table).select(columns);
          for (const column of order) query = query.order(column);
          const page = await query.range(from, from + 999);
          if (page.error) throw new Error(page.error.message);
          rows.push(...((page.data ?? []) as unknown as T[]));
          if ((page.data?.length ?? 0) < 1000) return rows;
        }
      };
      const [history, fills] = await Promise.all([
        all<NavRow>("nav_history", "as_of,nav,cash", ["as_of"]),
        all<FillRow>("trade_fills", FILL_COLUMNS, ["traded_at", "id"]),
      ]);
      if (disposed) return;
      setData({
        snapshot: (snapshot.data as unknown as Snapshot | null) ?? null,
        history,
        fills,
        loading: false,
        error: snapshot.error?.message,
      });
    })().catch((e) => {
      if (!disposed) setData({ ...EMPTY, error: (e as Error).message });
    });
    return () => {
      disposed = true;
    };
  }, [session]);
  return data;
}

export function resolver(items: ChartItem[]): (symbol: string) => string {
  const withoutSuffix = (symbol: string) => symbol.split(".")[0];
  const tickerBySymbol = new Map<string, string>();
  for (const item of items) {
    tickerBySymbol.set(item.ticker.toUpperCase(), item.ticker);
    if (item.quoteSymbol) {
      tickerBySymbol.set(item.quoteSymbol.toUpperCase(), item.ticker);
      tickerBySymbol.set(withoutSuffix(item.quoteSymbol).toUpperCase(), item.ticker);
    }
    for (const alias of item.aliases ?? []) tickerBySymbol.set(alias.toUpperCase(), item.ticker);
  }
  return function watchlistTicker(symbol) {
    return (
      tickerBySymbol.get(symbol.toUpperCase()) ??
      tickerBySymbol.get(withoutSuffix(symbol).toUpperCase()) ??
      symbol
    );
  };
}

export type Pricing = (ticker: string) => {
  price: number;
  currency: string;
  /** Base-currency units per unit of `currency`. */
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
  /** Day change; null without a live quote. */
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
      const rate = p.fx_rate_to_base ?? (p.currency === base ? 1 : null);
      if (rate == null) warnings.push(`No ${p.currency} rate for ${ticker}; excluded from totals.`);
      priced = {
        price: p.mark_price,
        value: p.position_value,
        valueBase: rate != null && p.position_value != null ? p.position_value * rate : null,
        currency: p.currency,
        priceSource: "broker",
      };
      changes[ticker] = null;
    }
    const rate = p.fx_rate_to_base ?? (p.currency === base ? 1 : null);
    positions.push({
      ticker,
      name: p.description || undefined,
      source: "ibkr",
      account: p.account_id ?? undefined,
      quantity: p.quantity,
      ...priced,
      costBasis: p.cost_basis,
      costBasisBase: rate != null && p.cost_basis != null ? p.cost_basis * rate : null,
      unrealizedPnl: p.unrealized_pnl,
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
  const conidOf = new Map(rows.map((r) => [r.id, r.conid]));
  let from = "";
  let to = "";
  const fills: TradeFill[] = rows.map((t) => {
    const day = t.traded_at.slice(0, 10);
    if (day && (!from || day < from)) from = day;
    if (day && (!to || day > to)) to = day;
    return {
      id: t.id,
      ticker: resolve(t.symbol),
      symbol: t.symbol,
      description: t.description,
      assetCategory: t.asset_category,
      account: t.account_id ?? "",
      dateTime: t.traded_at,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
      currency: t.currency,
      fxRateToBase: t.fx_rate_to_base ?? (t.currency === base ? 1 : null),
      proceeds: t.proceeds,
      commission: t.commission,
      netCash: t.net_cash,
      brokerPnl: t.broker_pnl,
      openClose: t.open_close,
    };
  });
  const toBase = (fill: TradeFill, value: number) => {
    if (fill.fxRateToBase !== null) return value * fill.fxRateToBase;
    missingFx.add(fill.currency);
    return 0;
  };
  const keyOf = (f: TradeFill) =>
    `${f.account}:${conidOf.get(f.id) || `${f.symbol}:${f.currency}`}`;
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
