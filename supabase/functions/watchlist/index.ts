// Watchlist edits go through Supabase's REST layer, where row security scopes them to the caller; this function adds what the database cannot: prices and symbol search. The gateway rejects calls without a JWT, but API keys pass it too, so the caller is still checked here.

import type { LookupResponse, SymbolMatch } from "../../../shared/api.ts";
import { db } from "../_shared/db.ts";
import { CORS, json } from "../_shared/http.ts";
import { isChartRange, prices } from "../_shared/prices.ts";
import { DAY_MS, throttled } from "../_shared/throttle.ts";
import { loadList } from "../_shared/watchlist.ts";
import { resolveCaller } from "./auth.ts";

// Enough to set up a watchlist in a day; not enough to use the function as a search proxy.
const LOOKUP_LIMIT = { max: 100, perMs: DAY_MS };

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "GET") return json({ error: "GET only." }, 405);
  try {
    const caller = await resolveCaller(db, request);
    if (caller.via === "none") return json({ error: "Sign in first." }, 401);
    const url = new URL(request.url);
    const query = url.searchParams.get("lookup");
    if (query) {
      if (await throttled(caller.owner, "lookup", LOOKUP_LIMIT))
        return json(
          { error: `That is ${LOOKUP_LIMIT.max} lookups in the last day. Try again later.` },
          429,
        );
      return json({ results: await searchSymbols(query) } satisfies LookupResponse);
    }
    const range = url.searchParams.get("range") ?? "1d";
    if (!isChartRange(range)) return json({ error: "Unsupported range." }, 400);
    return json(await prices(range, await loadList(db, caller.owner)));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
