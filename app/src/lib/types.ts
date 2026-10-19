export type PositionSource = "ibkr" | "kraken";

export interface Position {
  ticker: string;
  name?: string;
  source: PositionSource;
  account?: string;
  quantity: number;
  currency: string;
  /** In `currency`. */
  price: number | null;
  /** In `currency`. */
  value: number | null;
  valueBase: number | null;
  costBasis?: number | null;
  costBasisBase?: number | null;
  unrealizedPnl?: number | null;
  priceSource: "quote" | "broker";
  asOf: string;
}

export interface Portfolio {
  asOf: string;
  baseCurrency: string;
  positions: Position[];
  /** Base currency; negative means a margin loan; null when the Flex query lacks the Cash Report. */
  cash: { value: number; asOf: string; source: "ibkr" | "account" } | null;
  /** The broker's own net liquidation, for reconciliation. */
  brokerNav: { value: number; asOf: string } | null;
  /** Base currency. */
  totals: {
    /** Positions only. */
    value: number;
    /** Positions plus cash. */
    netValue: number;
    /** Over positions that report one; `costBasisCoverage` is their value, so a return compares like for like. */
    costBasis: number;
    costBasisCoverage: number;
    byTheme: { theme: string; label: string; value: number; share: number }[];
    bySource: { source: PositionSource; value: number }[];
  };
  watchOnly: string[];
  warnings: string[];
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
  /** Base-currency units per unit of `currency` on the trade date. */
  fxRateToBase: number | null;
  /** Before commission; negative on a buy. */
  proceeds: number;
  /** Negative. */
  commission: number;
  /** proceeds + commission. */
  netCash: number;
  /** Broker's FIFO realised P&L, for reconciliation. */
  brokerPnl: number | null;
  /** Broker's O (open) / C (close) flag; "C;O" flips through zero. */
  openClose: string | null;
}

/** Flat to flat on one instrument, so scaling in and out stays one trade: the decision to hold the name is scored, not each execution. */
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
  /** Absolute. */
  peakQuantity: number;
  /** 0 when closed. */
  openQuantity: number;
  /** Before commission. */
  entryValueBase: number;
  entryPrice: number;
  /** Average across exit fills; null until the first exit. */
  exitPrice: number | null;
  /**
   * At the last fill's rate: a foreign position is funded by a loan in its currency, so the FX move is not part of the trade. Realised so far while open.
   */
  pnlBase: number;
  /** Net cash, trade currency. */
  pnl: number;
  /** pnlBase / entryValueBase. Null while open: the remainder is unpriced. */
  returnPct: number | null;
  commissionBase: number;
  /** Broker's FIFO P&L, trade currency. */
  brokerPnl: number | null;
  /** The entry predates the earliest statement; kept for the record, left out of the statistics. */
  truncated: boolean;
}

/** Scored by the broker's FIFO matching. The broker omits the matched lots' entry date, so there is no holding time. */
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
  /** Matched lots' cost, trade currency: proceeds − P&L. */
  cost: number;
  /** Broker FIFO P&L net of commissions, trade currency. */
  pnl: number;
  /** `pnl` at the fill's rate. */
  pnlBase: number;
  costBase: number;
  returnPct: number;
}

/** The view prices the open quantity live, so total P&L is realised plus unrealised. */
export interface TradeName {
  ticker: string;
  symbol: string;
  description: string;
  currency: string;
  firstAt: string;
  lastAt: string;
  /** Including an open one. */
  roundTrips: number;
  closes: number;
  closeWins: number;
  status: "held" | "closed";
  /** Signed; negative when short. */
  openQuantity: number;
  /** FIFO, trade currency, commissions included. */
  openCost: number;
  /** At the entry rates; signed like `openQuantity`. */
  openCostBase: number;
  /** Most cost held at once. */
  peakCostBase: number;
  /** Broker's FIFO P&L over the name's closes. */
  realisedBase: number;
  /** Some history predates the statements. */
  truncated: boolean;
}

export interface TradesFile {
  asOf: string;
  baseCurrency: string;
  /** Statement date range of the fills. */
  from: string;
  to: string;
  fills: TradeFill[];
  roundTrips: RoundTrip[];
  closes: TradeClose[];
  names: TradeName[];
  sources: string[];
  warnings: string[];
}
