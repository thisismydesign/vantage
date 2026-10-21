import type {
  BaseCurrency,
  ChartsResponse,
  HistoryRange,
  IntradaySeries,
  VantageHistory,
} from "@shared/api.ts";

export type Display = BaseCurrency | "native";
export type Period = "1d" | "24h" | "1w" | HistoryRange;
/** The fields read from the statement's rows. */
export type Holding = {
  account_id: string | null;
  symbol: string;
  description: string;
  asset_category: string;
  currency: string;
  quantity: number;
  position_value: number | null;
  cost_basis: number | null;
  fx_rate_to_base: number | null;
};
export type Fill = {
  account_id: string | null;
  symbol: string;
  asset_category: string;
  currency: string;
  traded_at: string;
  quantity: number;
  net_cash: number;
  fx_rate_to_base: number | null;
};

export type PositionLine = {
  key: string;
  ticker: string;
  name: string;
  /** Of every amount on the line. */
  currency: string;
  value: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
  /** The period's P&L over `invested`. */
  change: number | null;
  /** Counts the trades inside the period, so a position bought midway gains only from its purchase. */
  periodPnl: number | null;
  /** The value held at the period's start plus what was put in during it. */
  invested: number | null;
  /** The first trade's day, when the period started with none held. */
  openedAt: string | null;
  live: boolean;
};

type Series = IntradaySeries | VantageHistory | undefined;
const asSession = (s: Series) => (s && "points" in s ? s : undefined);
const asHistory = (s: Series) => (s && "ranges" in s ? s : undefined);

/** `rates.get(c)[b]`: units of base `b` per unit of `c`, from each series' latest point. */
function latestRates(day: ChartsResponse) {
  const rates = new Map<string, Partial<Record<BaseCurrency, number>>>();
  for (const series of Object.values(day.series)) {
    const s = asSession(series);
    const last = s?.points.at(-1)?.[1];
    if (!s || !last) continue;
    const entry = rates.get(s.currency) ?? {};
    for (const base of ["EUR", "USD"] as const) {
      const converted = s.converted?.[base]?.at(-1);
      if (converted != null) entry[base] ??= converted / last;
    }
    rates.set(s.currency, entry);
  }
  return (from: string, to: string): number | null => {
    if (from === to) return 1;
    const direct = rates.get(from)?.[to as BaseCurrency];
    if (direct) return direct;
    const inverse = rates.get(to)?.[from as BaseCurrency];
    if (inverse) return 1 / inverse;
    for (const via of ["EUR", "USD"] as const) {
      const a = from === via ? 1 : rates.get(from)?.[via];
      const b = to === via ? 1 : rates.get(to)?.[via];
      if (a && b) return a / b;
    }
    return null;
  };
}

/** In `currency`, at the FX rate of the point's own time. */
function valueAt(
  native: number,
  converted: Partial<Record<BaseCurrency, (number | null)[]>> | undefined,
  i: number,
  from: string,
  currency: string,
) {
  if (from === currency) return native;
  return converted?.[currency as BaseCurrency]?.[i] ?? null;
}

type Start = { price: number; at: string; timeZone?: string };

function periodStart(
  ticker: string,
  period: Period,
  day: IntradaySeries,
  data: ChartsResponse | undefined,
  currency: string,
): Start | null {
  if (period === "1d") {
    const price =
      day.currency === currency
        ? day.previousClose
        : (day.previousCloseConverted?.[currency as BaseCurrency] ?? null);
    if (price == null || !day.previousCloseAt) return null;
    return { price, at: day.previousCloseAt, timeZone: day.timeZone };
  }
  if (data?.range !== (period === "24h" || period === "1w" ? period : "history")) return null;
  const session = asSession(data.series[ticker]);
  if (session) {
    if (!session.points.length) return null;
    const price = valueAt(session.points[0][1], session.converted, 0, session.currency, currency);
    return price == null ? null : { price, at: session.points[0][0], timeZone: session.timeZone };
  }
  const history = asHistory(data.series[ticker]);
  const range = history?.ranges[period as HistoryRange];
  if (!history || !range?.points.length) return null;
  const from = history.currency ?? day.currency;
  const i = range.points.findIndex(
    (_, j) => valueAt(1, range.converted, j, from, currency) != null,
  );
  if (i < 0) return null;
  const price = valueAt(range.points[i][1], range.converted, i, from, currency)!;
  return { price, at: range.points[i][0] };
}

const wallTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(" ", "T");

/** Fills carry exchange wall time; history bars are compared by day, where a fill on the first bar's day predates its close. */
function after(start: Start) {
  if (start.timeZone) {
    const from = wallTime(start.at, start.timeZone);
    return (tradedAt: string) => tradedAt.slice(0, 19) > from;
  }
  const from = start.at.slice(0, 10);
  return (tradedAt: string) => tradedAt.slice(0, 10) > from;
}

export function buildPositions({
  snapshot,
  fills,
  day,
  periodData,
  period,
  display,
  base,
  resolve,
  names,
}: {
  snapshot: { as_of: string; positions: Holding[] };
  fills: Fill[];
  day: ChartsResponse;
  /** The 24h, 1w or history response; unused for 1d. */
  periodData: ChartsResponse | undefined;
  period: Period;
  display: Display;
  /** The account's. */
  base: BaseCurrency;
  resolve: (symbol: string) => string;
  names: Map<string, string>;
}): PositionLine[] {
  const fx = latestRates(day);
  const lines: PositionLine[] = [];
  for (const p of snapshot.positions) {
    if (p.quantity === 0) continue;
    const ticker = resolve(p.symbol);
    const session = asSession(day.series[ticker]);
    const last = session?.points.at(-1)?.[1];
    const live = Boolean(session && last != null);
    const currency = display === "native" ? (live ? session!.currency : p.currency) : display;
    const rate = (from: string) =>
      fx(from, currency) ??
      (from === p.currency && currency === base ? (p.fx_rate_to_base ?? null) : null);

    const priceRate = live ? rate(session!.currency) : null;
    const price = live && priceRate != null ? last! * priceRate : null;
    const brokerRate = rate(p.currency);
    const value =
      price != null
        ? price * p.quantity
        : p.position_value != null && brokerRate != null
          ? p.position_value * brokerRate
          : null;
    const cost = p.cost_basis != null && brokerRate != null ? p.cost_basis * brokerRate : null;
    const unrealized = value != null && cost != null ? value - cost : null;

    let change: number | null = null;
    let periodPnl: number | null = null;
    let invested: number | null = null;
    let openedAt: string | null = null;
    const start = live ? periodStart(ticker, period, session!, periodData, currency) : null;
    if (start && price != null) {
      const since = after(start);
      const inside = fills.filter(
        (f) =>
          f.symbol === p.symbol &&
          f.account_id === p.account_id &&
          f.asset_category === p.asset_category &&
          since(f.traded_at) &&
          f.traded_at.slice(0, 10) <= snapshot.as_of,
      );
      let held = p.quantity;
      let cash = 0;
      let added = 0;
      for (const f of inside) {
        held -= f.quantity;
        // The statement's rate is the trade day's; other currencies only have today's.
        const r =
          currency === base && f.fx_rate_to_base != null && f.currency !== base
            ? f.fx_rate_to_base
            : fx(f.currency, currency);
        if (r == null) {
          cash = NaN;
          break;
        }
        cash += f.net_cash * r;
        if (Math.sign(f.quantity) === Math.sign(p.quantity)) added += Math.abs(f.net_cash * r);
      }
      const pnl = price * p.quantity - held * start.price + cash;
      if (Number.isFinite(pnl)) {
        periodPnl = pnl;
        invested = Math.abs(held * start.price) + added;
        change = invested ? pnl / invested : null;
        // Fractional quantities leave float dust where a position was opened from nothing.
        if (Math.abs(held) < 1e-9 && inside.length)
          openedAt = inside
            .map((f) => f.traded_at)
            .sort()[0]
            .slice(0, 10);
      }
    }

    lines.push({
      key: `${p.account_id ?? ""}:${p.symbol}:${p.asset_category}`,
      ticker,
      name: names.get(ticker) ?? p.description,
      currency,
      value,
      unrealized,
      unrealizedPct: unrealized != null && cost ? unrealized / Math.abs(cost) : null,
      change,
      periodPnl,
      invested,
      openedAt,
      live,
    });
  }
  return lines;
}

export type PositionTotals = {
  value: number;
  unrealized: number | null;
  unrealizedPct: number | null;
  change: number | null;
  periodPnl: number | null;
};

/** All lines MUST share one currency. */
export function totalsOf(lines: PositionLine[]): PositionTotals {
  let value = 0;
  let unrealized = 0;
  let cost = 0;
  let pnl = 0;
  let withPnl = 0;
  let invested = 0;
  for (const l of lines) {
    value += l.value ?? 0;
    if (l.unrealized != null && l.value != null) {
      unrealized += l.unrealized;
      cost += Math.abs(l.value - l.unrealized);
    }
    if (l.periodPnl != null) {
      pnl += l.periodPnl;
      invested += l.invested ?? 0;
      withPnl++;
    }
  }
  return {
    value,
    unrealized: cost ? unrealized : null,
    unrealizedPct: cost ? unrealized / cost : null,
    change: withPnl && invested ? pnl / invested : null,
    periodPnl: withPnl ? pnl : null,
  };
}

export type SortKey =
  "ticker" | "value" | "weight" | "unrealized" | "unrealizedPct" | "change" | "periodPnl";
export type Sort = { key: SortKey; desc: boolean };
export const BY_TICKER: Sort = { key: "ticker", desc: false };
const AMOUNTS = new Set<SortKey>(["value", "weight", "unrealized", "periodPnl"]);

/** Amounts rank by `ranked`'s lines, matched by key, since native ones don't compare across currencies. Unknowns go last either way. */
export function sortLines(
  lines: PositionLine[],
  sort: Sort,
  ranked: PositionLine[] = lines,
): PositionLine[] {
  const byKey = new Map(ranked.map((l) => [l.key, l]));
  const field = sort.key === "weight" ? "value" : sort.key;
  const valueOf = (l: PositionLine) =>
    (AMOUNTS.has(sort.key) ? (byKey.get(l.key) ?? l) : l)[field as Exclude<SortKey, "weight">];
  const byTicker = (a: PositionLine, b: PositionLine) =>
    a.ticker.localeCompare(b.ticker) || a.key.localeCompare(b.key);
  return [...lines].sort((a, b) => {
    const x = valueOf(a);
    const y = valueOf(b);
    if (x == null || y == null) return x == null && y == null ? byTicker(a, b) : x == null ? 1 : -1;
    const order =
      typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
    return (sort.desc ? -order : order) || byTicker(a, b);
  });
}
