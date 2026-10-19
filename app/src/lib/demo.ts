import type { CalendarEvent, NewsItem } from "@shared/types.ts";
import { demoRows } from "../../../supabase/functions/_shared/demo.ts";
import type { BrokerData } from "./broker.ts";

// Once per page load; broker.ts, events.ts and news.ts import this module, so nothing runs at import time.
let rows: ReturnType<typeof demoRows> | undefined;
const demo = () => (rows ??= demoRows(new Date()));

export const demoBroker = (): BrokerData => {
  const { snapshot, positions, nav, fills } = demo();
  return {
    snapshot: { ...snapshot, positions },
    history: nav.map(({ as_of, nav, cash }) => ({ as_of, nav, cash })),
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
