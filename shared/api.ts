// What the vantage function returns to the app.

export type BaseCurrency = "EUR" | "USD";
export const BASES: BaseCurrency[] = ["EUR", "USD"];

export type ChartRange = "1d" | "24h" | "1w" | "history";
export type HistoryRange = "1m" | "3m" | "6m" | "ytd" | "1y" | "5y";

export interface IntradaySeries {
  marketOpen?: string;
  marketClose?: string;
  intervalMinutes?: number;
  ticker: string;
  currency: string;
  timeZone: string;
  session: string;
  previousCloseAt?: string;
  /** Pre, regular and post merged. */
  openPeriods?: [string, string][];
  /** At each point's FX rate, aligned with `points`. */
  converted?: Record<BaseCurrency, (number | null)[]>;
  previousCloseConverted?: Record<BaseCurrency, number | null>;
  previousClose: number | null;
  points: [string, number][];
}

export interface RangeSeries {
  /** Keys are ISO times for intraday bars, dates for daily and weekly ones. */
  points: [string, number][];
  /** At each point's FX rate, aligned with `points`. */
  converted?: Record<BaseCurrency, (number | null)[]>;
}

export interface VantageHistory {
  symbol: string;
  currency?: string;
  ranges: Record<HistoryRange, RangeSeries>;
}

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

/** `GET ?range=`: intraday series for the intraday ranges, history for `history`. */
export type ChartsResponse = {
  asOf: string;
  range: ChartRange;
  ttlMs: number;
  themes: ChartTheme[];
  items: ChartItem[];
  /** By ticker. */
  series: Record<string, IntradaySeries | VantageHistory>;
  fetchedAt: Record<string, string>;
  errors: Record<string, string>;
};

/** `GET ?lookup=`: Yahoo symbol search. */
export type SymbolMatch = { symbol: string; name: string; exchange: string; type: string };
export type LookupResponse = { results: SymbolMatch[] };
