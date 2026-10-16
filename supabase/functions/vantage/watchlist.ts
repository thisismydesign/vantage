// Watchlist rows per owner, the template for new accounts, and seeding.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ThemeRow = { id: string; label: string; position: number };
export type WatchRow = {
  ticker: string;
  name: string;
  quote_symbol: string | null;
  currency: string | null;
  themes: string[];
  aliases: string[];
  disabled: boolean;
  position: number;
};

export type GroupInput = { id?: string; label: string };
export type ItemInput = {
  ticker: string;
  name?: string;
  symbol?: string;
  currency?: string;
  groups?: string[];
};

export const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/** The template or an owner's list, ordered as the page shows them. */
export async function loadList(db: SupabaseClient, owner: string | null) {
  const [themes, items] = owner
    ? await Promise.all([
        db
          .from("watchlist_themes")
          .select("id,label,position")
          .eq("owner", owner)
          .order("position"),
        db
          .from("watchlist")
          .select("ticker,name,quote_symbol,currency,themes,aliases,disabled,position")
          .eq("owner", owner)
          .eq("disabled", false)
          .order("position")
          .order("ticker"),
      ])
    : await Promise.all([
        db.from("default_themes").select("id,label,position").order("position"),
        db
          .from("default_watchlist")
          .select("ticker,name,quote_symbol,currency,themes,aliases,disabled,position")
          .eq("disabled", false)
          .order("position")
          .order("ticker"),
      ]);
  fail(themes.error);
  fail(items.error);
  return { themes: themes.data as ThemeRow[], items: items.data as WatchRow[] };
}

/** Copy the template into a fresh owner. */
export async function seedDefaults(db: SupabaseClient, owner: string) {
  const { themes, items } = await loadList(db, null);
  if (themes.length)
    fail((await db.from("watchlist_themes").insert(themes.map((t) => ({ ...t, owner })))).error);
  if (items.length)
    fail((await db.from("watchlist").insert(items.map((i) => ({ ...i, owner })))).error);
}

export async function addGroup(db: SupabaseClient, owner: string, group: GroupInput) {
  const label = group.label.trim();
  const id = group.id?.trim() || slug(label);
  if (!id || !label) throw new Error("A group needs a label.");
  const { count } = await db
    .from("watchlist_themes")
    .select("id", { count: "exact", head: true })
    .eq("owner", owner);
  fail(
    (
      await db
        .from("watchlist_themes")
        .upsert({ owner, id, label, position: count ?? 0 }, { onConflict: "owner,id" })
    ).error,
  );
  return { id, label };
}

/** Yahoo's best match for a ticker or name, for items given without a symbol. */
export async function resolveSymbol(query: string) {
  const url = new URL("https://query2.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", "6");
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("listsCount", "0");
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; vantage)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Yahoo responded ${response.status}`);
  const body = await response.json();
  type Quote = { symbol?: string; longname?: string; shortname?: string; quoteType?: string };
  const quotes = ((body.quotes ?? []) as Quote[]).filter((q) => q.symbol);
  const exact = quotes.find((q) => q.symbol!.toUpperCase() === query.toUpperCase());
  const pick = exact ?? quotes.find((q) => q.quoteType !== "ETF") ?? quotes[0];
  if (!pick) throw new Error(`No listing found for ${query}`);
  return { symbol: pick.symbol!, name: pick.longname ?? pick.shortname ?? pick.symbol! };
}

export async function addItem(db: SupabaseClient, owner: string, item: ItemInput) {
  const ticker = item.ticker.trim().toUpperCase();
  if (!ticker) throw new Error("An item needs a ticker.");
  let symbol = item.symbol?.trim();
  let name = item.name?.trim();
  if (!symbol || !name) {
    const found = await resolveSymbol(symbol ?? ticker);
    symbol ??= found.symbol;
    name ??= found.name;
  }
  const { count } = await db
    .from("watchlist")
    .select("ticker", { count: "exact", head: true })
    .eq("owner", owner);
  const row = {
    owner,
    ticker,
    name,
    quote_symbol: symbol,
    currency: item.currency ?? null,
    themes: item.groups ?? [],
    aliases: [],
    disabled: false,
    position: count ?? 0,
  };
  fail((await db.from("watchlist").upsert(row, { onConflict: "owner,ticker" })).error);
  return { ticker, name, symbol, groups: row.themes };
}

/** Public shape of a list, as the page and the API hand it out. */
export const publicList = ({ themes, items }: { themes: ThemeRow[]; items: WatchRow[] }) => ({
  groups: themes.map((t) => ({ id: t.id, label: t.label })),
  items: items.map((i) => ({
    ticker: i.ticker,
    name: i.name,
    symbol: i.quote_symbol,
    currency: i.currency,
    groups: i.themes,
  })),
});
