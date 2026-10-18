import { useEffect, useState } from "react";
import type { IntradaySeries, VantageHistory } from "@shared/types.ts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
export const CONFIGURED = Boolean(SUPABASE_URL);

export type ChartRange = "1d" | "24h" | "1w" | "history";
export type ChartTheme = { id: string; label: string };
export type ChartItem = {
  ticker: string;
  name: string;
  quoteSymbol: string | null;
  currency: string | null;
  themes: string[];
  /** Symbols a broker may report this holding under. */
  aliases: string[];
};
export type ChartsResponse = {
  asOf: string;
  range: ChartRange;
  ttlMs: number;
  themes: ChartTheme[];
  items: ChartItem[];
  series: Record<string, IntradaySeries | VantageHistory>;
  fetchedAt: Record<string, string>;
  errors: Record<string, string>;
};

export const asSession = (s: IntradaySeries | VantageHistory | undefined) =>
  s && "points" in s ? s : undefined;
export const asHistory = (s: IntradaySeries | VantageHistory | undefined) =>
  s && "ranges" in s ? s : undefined;

export const API_BASE = `${SUPABASE_URL}/functions/v1/vantage`;

async function fetchCharts(range: ChartRange, accessToken?: string): Promise<ChartsResponse> {
  const response = await fetch(`${API_BASE}?range=${range}`, {
    headers: {
      ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Charts API responded ${response.status}`);
  return (await response.json()) as ChartsResponse;
}

const cacheKey = (range: ChartRange) => `vantage:data:v2:${range}`;
function readCache(range: ChartRange): ChartsResponse | undefined {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(range)) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
}
function writeCache(range: ChartRange, data: ChartsResponse) {
  try {
    localStorage.setItem(cacheKey(range), JSON.stringify(data));
  } catch {
    /* Storage may be full or unavailable. */
  }
}

export type ChartData = {
  data?: ChartsResponse;
  status: "loading" | "ok" | "failed";
  updating: boolean;
};

/** A failed refresh keeps the last good response so the charts never blank. */
export function useChartData(
  range: ChartRange | null,
  refreshRequestedAt: number,
  accessToken?: string,
): ChartData {
  const [state, setState] = useState<ChartData>(() => ({
    data: range ? readCache(range) : undefined,
    status: "loading",
    updating: Boolean(range),
  }));
  useEffect(() => {
    if (!CONFIGURED || !range) return;
    let disposed = false;
    setState((previous) => ({
      ...previous,
      data: previous.data?.range === range ? previous.data : readCache(range),
      updating: true,
    }));
    fetchCharts(range, accessToken)
      .then((data) => {
        if (disposed) return;
        writeCache(range, data);
        setState({ data, status: "ok", updating: false });
      })
      .catch(() => {
        if (!disposed) setState((previous) => ({ ...previous, status: "failed", updating: false }));
      });
    return () => {
      disposed = true;
    };
  }, [range, refreshRequestedAt, accessToken]);
  return state;
}
