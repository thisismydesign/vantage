// The vantage function's requests and responses.

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

/** No reset by email, so `/onboard` asks for a strong one. */
export const MIN_PASSWORD_LENGTH = 8;
export const ONBOARD_MAX = { groups: 30, items: 100 };

export type GroupInput = { id?: string; label: string };
export type ItemInput = {
  ticker: string;
  name?: string;
  symbol?: string;
  currency?: string;
  groups?: string[];
};
export type ListGroup = { id: string; label: string };
export type ListItem = {
  ticker: string;
  name: string;
  symbol: string | null;
  currency: string | null;
  groups: string[];
};

export type ApiSession = { access_token: string; refresh_token: string; expires_at?: number };

/** `POST /onboard`: a new account. Without a password, the function makes one. */
export type OnboardRequest = {
  email: string;
  password?: string;
  defaults?: boolean;
  groups?: GroupInput[];
  items?: ItemInput[];
};
export type OnboardResponse = {
  email: string;
  /** Only when the function made it; the user signs in with it. */
  password?: string;
  session: ApiSession;
  warnings: string[];
  list: { groups: ListGroup[]; items: ListItem[] };
  api: Record<string, string>;
};
