import type { ChartsResponse } from "@shared/api.ts";
import type { CalendarEvent, NewsItem } from "@shared/tables.ts";
import type { BrokerData } from "../broker.ts";
import { demoList, demoRows } from "./data.ts";

// Built on first use, once per page load.
let rows: ReturnType<typeof demoRows> | undefined;
const demo = () => (rows ??= demoRows(new Date()));

export const demoBroker = (): BrokerData => {
  const { snapshot, positions, nav, fills } = demo();
  return {
    snapshot: { ...snapshot, positions },
    history: nav.map(({ as_of, nav, cash, flow }) => ({ as_of, nav, cash, flow })),
    fills,
    loading: false,
  };
};

export const demoEvents = (): CalendarEvent[] =>
  demo()
    .events.map((e) => ({
      ...e,
      id: e.external_id,
      source: null,
      url: null,
      updated_at: e.starts_on,
    }))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.ticker.localeCompare(b.ticker));

export const demoNews = (): NewsItem[] =>
  demo()
    .news.map((n) => ({
      ...n,
      id: n.external_id,
      source: null,
      url: null,
      updated_at: n.published_at,
    }))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));

const list = demoList();

/** The quote symbols the function prices for the demo watchlist. */
export const DEMO_SYMBOLS = list.items.map((i) => i.quote_symbol);

/** The function prices bare symbols; the demo watchlist adds names, groups and tickers. */
export function withDemoList(response: ChartsResponse): ChartsResponse {
  const tickerOf = new Map(list.items.map((i) => [i.quote_symbol, i.ticker]));
  const rekey = <T>(byKey: Record<string, T>) =>
    Object.fromEntries(Object.entries(byKey).map(([k, v]) => [tickerOf.get(k) ?? k, v]));
  return {
    ...response,
    themes: list.themes.map(({ id, label }) => ({ id, label })),
    items: list.items.map((i) => ({
      ticker: i.ticker,
      name: i.name,
      quoteSymbol: i.quote_symbol,
      currency: i.currency,
      themes: i.themes,
      aliases: i.aliases,
    })),
    series: rekey(response.series),
    fetchedAt: rekey(response.fetchedAt),
    errors: rekey(response.errors),
  };
}
