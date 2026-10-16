// Shapes shared by the web app and the edge functions.

export type AssetKind = "equity" | "crypto" | "private";

export type PositionSource = "ibkr" | "kraken";

export interface Position {
  ticker: string;
  name?: string;
  source: PositionSource;
  account?: string;
  quantity: number;
  currency: string;
  /** Last price in `currency`. */
  price: number | null;
  /** Market value in `currency`. */
  value: number | null;
  /** Market value converted to the portfolio base currency. */
  valueBase: number | null;
  costBasis?: number | null;
  /** Cost basis converted to the portfolio base currency. */
  costBasisBase?: number | null;
  unrealizedPnl?: number | null;
  /** Whether price/value came from a live quote or the broker's statement mark. */
  priceSource: "quote" | "broker";
  asOf: string;
}

export interface Portfolio {
  /** One account, as built from the latest broker statement. */
  asOf: string;
  baseCurrency: string;
  positions: Position[];
  /**
   * Base-currency cash. Negative means a margin loan. Comes from the Flex Cash
   * Report when the query includes it, otherwise unknown.
   */
  cash: { value: number; asOf: string; source: "ibkr" | "account" } | null;
  /** The broker's own net liquidation on its statement date — a reconciliation point. */
  brokerNav: { value: number; asOf: string } | null;
  /** Base-currency totals, plus per-theme breakdown. */
  totals: {
    /** Positions only. */
    value: number;
    /** Positions plus cash — what the account is actually worth. */
    netValue: number;
    /** Cost basis of the positions that report one, and their value, so a
     * portfolio-level return can be quoted on like-for-like coverage. */
    costBasis: number;
    costBasisCoverage: number;
    byTheme: { theme: string; label: string; value: number; share: number }[];
    bySource: { source: PositionSource; value: number }[];
  };
  /** Watchlist entries with no position — tracked, not held. */
  watchOnly: string[];
  warnings: string[];
}

export type HistoryRange = "1m" | "3m" | "6m" | "ytd" | "1y" | "5y";

/** One horizon's closes, thinned to about the chart's target point count. */
export interface RangeSeries {
  /** Keys are ISO times for intraday bars, dates for daily and weekly ones. */
  points: [string, number][];
  /** Each point in each base currency at the FX rate of its day, aligned with `points`. */
  converted?: Record<BaseCurrency, (number | null)[]>;
}

/** Vantage's history payload: one pre-cut series per horizon. */
export interface VantageHistory {
  symbol: string;
  currency?: string;
  ranges: Record<HistoryRange, RangeSeries>;
}

export interface TradeFill {
  id: string;
  ticker: string;
  symbol: string;
  description: string;
  assetCategory: string;
  account: string;
  /** ISO 8601 exchange-local time. */
  dateTime: string;
  side: "buy" | "sell";
  /** Positive buys, negative sells. */
  quantity: number;
  price: number;
  currency: string;
  /** Units of base currency per 1 unit of `currency` on the trade date. */
  fxRateToBase: number | null;
  /** Cash moved before commission, negative on a buy. */
  proceeds: number;
  /** Negative. */
  commission: number;
  /** proceeds + commission. */
  netCash: number;
  /** Broker's FIFO realised P&L on this fill, for reconciliation. */
  brokerPnl: number | null;
  /** Broker's O (open) / C (close) flag; "C;O" flips through zero. */
  openClose: string | null;
}

/**
 * A position from flat to flat: every fill on one instrument between a zero
 * position and the next. Scaling in and out stays one trade — what gets
 * scored is the decision to hold the name, not each execution.
 */
export interface RoundTrip {
  id: string;
  ticker: string;
  symbol: string;
  description: string;
  currency: string;
  direction: "long" | "short";
  status: "closed" | "open";
  openedAt: string;
  /** Null while open. */
  closedAt: string | null;
  /** Calendar days from first fill to last; to today while open. */
  holdingDays: number;
  fills: number;
  /** Largest absolute position reached. */
  peakQuantity: number;
  /** Quantity still held; 0 when closed. */
  openQuantity: number;
  /** Money committed on the entry side, base currency, before commission. */
  entryValueBase: number;
  entryPrice: number;
  /** Average across exit fills; null until the first exit. */
  exitPrice: number | null;
  /**
   * `pnl` converted at the last fill's rate. A foreign position is funded by a
   * loan in its currency, so the currency's move over the holding period is
   * not part of the trade. Realised so far while open.
   */
  pnlBase: number;
  /** Net cash across fills, trade currency. */
  pnl: number;
  /** pnlBase / entryValueBase. Null while open — the remainder is unpriced. */
  returnPct: number | null;
  commissionBase: number;
  /** Sum of the broker's FIFO P&L over the fills, trade currency. */
  brokerPnl: number | null;
  /**
   * The position was already open when the earliest statement starts, so the
   * entry is missing. Kept for the record, left out of the statistics.
   */
  truncated: boolean;
}

/**
 * One closing fill scored on its own, using the broker's FIFO matching. This
 * is the "every sell is a trade" view: scaling out of a position that never
 * went flat yields one of these per sell. The matched lots' entry date is not
 * reported, so there is no holding time.
 */
export interface TradeClose {
  /** The closing fill's id. */
  id: string;
  ticker: string;
  symbol: string;
  currency: string;
  direction: "long" | "short";
  dateTime: string;
  quantity: number;
  price: number;
  /** Cost of the matched lots, trade currency, derived as proceeds − P&L. */
  cost: number;
  /** Broker FIFO P&L net of commissions, trade currency. */
  pnl: number;
  /** `pnl` at the fill's rate. */
  pnlBase: number;
  costBase: number;
  returnPct: number;
}

/**
 * Everything ever done on one instrument: the closed history plus whatever is
 * still held. The view prices the open quantity with the latest quote, so the
 * name's total P&L is realised plus unrealised — how the bet on the company
 * is going, not how any one trade went.
 */
export interface TradeName {
  ticker: string;
  symbol: string;
  description: string;
  currency: string;
  firstAt: string;
  lastAt: string;
  /** Flat-to-flat cycles, including an open one. */
  roundTrips: number;
  closes: number;
  closeWins: number;
  status: "held" | "closed";
  /** Signed; negative when short. */
  openQuantity: number;
  /** FIFO cost of what is still held, trade currency, commissions included. */
  openCost: number;
  /** Same in base currency at the entry rates. Signed like `openQuantity`. */
  openCostBase: number;
  /** The most cost held at any moment, base currency — the capital the name tied up. */
  peakCostBase: number;
  /** Sum of the broker's FIFO P&L on the name's closes, base currency. */
  realisedBase: number;
  /** Some of this name's history predates the statements. */
  truncated: boolean;
}

/** Every fill, round trip and per-name total for one account. */
export interface TradesFile {
  asOf: string;
  baseCurrency: string;
  /** Earliest and latest statement dates the fills were read from. */
  from: string;
  to: string;
  fills: TradeFill[];
  roundTrips: RoundTrip[];
  closes: TradeClose[];
  names: TradeName[];
  sources: string[];
  warnings: string[];
}

export type BaseCurrency = "EUR" | "USD";

export interface IntradaySeries {
  marketOpen?: string;
  marketClose?: string;
  intervalMinutes?: number;
  ticker: string;
  currency: string;
  timeZone: string;
  session: string;
  /** ISO time of the last bar before this session. */
  previousCloseAt?: string;
  /** Stretches when the exchange was open (pre, regular and post merged), as ISO [start, end]. */
  openPeriods?: [string, string][];
  /** Each point in each base currency at the FX rate of that time, aligned with `points`. */
  converted?: Record<BaseCurrency, (number | null)[]>;
  previousCloseConverted?: Record<BaseCurrency, number | null>;
  previousClose: number | null;
  points: [string, number][];
}

import type { EventCategory } from "../supabase/functions/_shared/events.ts";

/** A row of `events`, as PostgREST returns it. */
export interface CalendarEvent {
  id: string;
  ticker: string;
  category: EventCategory;
  kind: string | null;
  title: string;
  description: string | null;
  starts_on: string;
  ends_on: string | null;
  estimated: boolean;
  source: string | null;
  url: string | null;
  external_id: string | null;
  updated_at: string;
}
