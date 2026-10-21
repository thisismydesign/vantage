import { useEffect, useState } from "react";
import type { ChartRange, ChartsResponse, IntradaySeries, VantageHistory } from "@shared/api.ts";
import { DEMO_SYMBOLS, withDemoList } from "./demo/index.ts";
import type { SessionState } from "./supabase.ts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
export const CONFIGURED = Boolean(SUPABASE_URL);

export const asSession = (s: IntradaySeries | VantageHistory | undefined) =>
  s && "points" in s ? s : undefined;
export const asHistory = (s: IntradaySeries | VantageHistory | undefined) =>
  s && "ranges" in s ? s : undefined;

export const API_BASE = `${SUPABASE_URL}/functions/v1/vantage`;
const WATCHLIST = `${SUPABASE_URL}/functions/v1/watchlist`;

class RateLimited extends Error {}

/** Signed in, the user's watchlist; signed out, the demo watchlist's symbols from the public function. */
async function fetchCharts(range: ChartRange, accessToken?: string): Promise<ChartsResponse> {
  const url = accessToken
    ? `${WATCHLIST}?range=${range}`
    : `${API_BASE}?range=${range}&symbols=${encodeURIComponent(DEMO_SYMBOLS.join(","))}`;
  const response = await fetch(url, {
    headers: {
      ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 429) throw new RateLimited();
  if (!response.ok) throw new Error(`Charts API responded ${response.status}`);
  const body = (await response.json()) as ChartsResponse;
  return accessToken ? body : withDemoList(body);
}

/** `owner` is the user id, or "demo" signed out. */
const cacheKey = (owner: string, range: ChartRange) => `vantage:data:v3:${owner}:${range}`;
function readCache(
  owner: string | undefined,
  range: ChartRange | null,
): ChartsResponse | undefined {
  if (!owner || !range) return undefined;
  try {
    return JSON.parse(localStorage.getItem(cacheKey(owner, range)) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
}
function writeCache(owner: string, range: ChartRange, data: ChartsResponse) {
  try {
    localStorage.setItem(cacheKey(owner, range), JSON.stringify(data));
  } catch {
    /* Storage may be full or unavailable. */
  }
}

export type ChartData = {
  data?: ChartsResponse;
  /** Whose data `data` is. */
  owner?: string;
  status: "loading" | "ok" | "failed";
  /** The last failure was the signed-out rate limit. */
  limited?: boolean;
  updating: boolean;
  /** Updating over data older than a refresh cycle, such as the cache on opening the app. */
  stale: boolean;
};

// Past one refresh cycle, so the minute's routine refresh doesn't flag the prices as old.
const STALE_MS = 2 * 60_000;
const isOld = (data: ChartsResponse | undefined) =>
  Boolean(data && Date.now() - Date.parse(data.asOf) > STALE_MS);

/** A failed refresh keeps the last good response so the charts never blank. Waits while the session is unknown. */
export function useChartData(
  range: ChartRange | null,
  refreshRequestedAt: number,
  session: SessionState,
): ChartData {
  const owner = session === undefined ? undefined : (session?.user.id ?? "demo");
  const accessToken = session?.access_token;
  const [state, setState] = useState<ChartData>(() => {
    const data = readCache(owner, range);
    return { data, status: "loading", updating: Boolean(range), stale: isOld(data) };
  });
  useEffect(() => {
    if (!CONFIGURED || !range || !owner) return;
    let disposed = false;
    setState((previous) => {
      const data =
        previous.data?.range === range && previous.owner === owner
          ? previous.data
          : readCache(owner, range);
      return { ...previous, data, owner, updating: true, stale: isOld(data) };
    });
    fetchCharts(range, accessToken)
      .then((data) => {
        if (disposed) return;
        writeCache(owner, range, data);
        setState({ data, owner, status: "ok", updating: false, stale: false });
      })
      .catch((e) => {
        if (!disposed)
          setState((previous) => ({
            ...previous,
            status: "failed",
            limited: e instanceof RateLimited,
            updating: false,
            stale: false,
          }));
      });
    return () => {
      disposed = true;
    };
  }, [range, refreshRequestedAt, owner, accessToken]);
  return state;
}
