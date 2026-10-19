import type { RoundTrip, TradeFill } from "../types.ts";

const DAY = 86_400_000;
const EPS = 1e-9;

const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY));

function splitProRata(fill: TradeFill, quantity: number): [TradeFill, TradeFill] {
  const share = quantity / fill.quantity;
  const part = (f: number) => f * share;
  const rest = (f: number) => f * (1 - share);
  return [
    {
      ...fill,
      quantity,
      proceeds: part(fill.proceeds),
      commission: part(fill.commission),
      netCash: part(fill.netCash),
      brokerPnl: fill.brokerPnl,
    },
    {
      ...fill,
      quantity: fill.quantity - quantity,
      proceeds: rest(fill.proceeds),
      commission: rest(fill.commission),
      netCash: rest(fill.netCash),
      brokerPnl: null,
      openClose: "O",
    },
  ];
}

interface Open {
  fills: TradeFill[];
  position: number;
  peak: number;
  truncated: boolean;
}

function finish(
  key: string,
  open: Open,
  seq: number,
  today: string,
  toBase: (fill: TradeFill, value: number) => number,
): RoundTrip {
  const first = open.fills[0];
  const last = open.fills[open.fills.length - 1];
  const direction = first.quantity > 0 ? "long" : "short";
  const isEntry = (f: TradeFill) => (direction === "long" ? f.quantity > 0 : f.quantity < 0);
  const entries = open.fills.filter(isEntry);
  const exits = open.fills.filter((f) => !isEntry(f));
  const qty = (fs: TradeFill[]) => fs.reduce((s, f) => s + Math.abs(f.quantity), 0);
  const notional = (fs: TradeFill[]) => fs.reduce((s, f) => s + Math.abs(f.proceeds), 0);
  const notionalBase = (fs: TradeFill[]) =>
    fs.reduce((s, f) => s + toBase(f, Math.abs(f.proceeds)), 0);

  const closed = Math.abs(open.position) < EPS;
  const pnl = open.fills.reduce((s, f) => s + f.netCash, 0);
  // Foreign stock is bought on a loan in its currency, so the FX move cancels against the loan; the exit rate scores the stock decision alone. Entries convert fill by fill: what the money was worth when committed.
  const pnlBase = toBase(last, pnl);
  const entryValueBase = notionalBase(entries);
  const brokerPnls = open.fills.map((f) => f.brokerPnl).filter((v): v is number => v !== null);

  return {
    id: `${key}-${first.dateTime.slice(0, 10)}-${seq}`,
    ticker: first.ticker,
    symbol: first.symbol,
    description: first.description,
    currency: first.currency,
    direction,
    status: closed ? "closed" : "open",
    openedAt: first.dateTime,
    closedAt: closed ? last.dateTime : null,
    holdingDays: daysBetween(first.dateTime, closed ? last.dateTime : today),
    fills: open.fills.length,
    peakQuantity: open.peak,
    openQuantity: closed ? 0 : open.position,
    entryValueBase,
    entryPrice: qty(entries) ? notional(entries) / qty(entries) : first.price,
    exitPrice: qty(exits) ? notional(exits) / qty(exits) : null,
    pnl,
    pnlBase,
    returnPct: closed && !open.truncated && entryValueBase ? pnlBase / entryValueBase : null,
    commissionBase: toBase(
      last,
      open.fills.reduce((s, f) => s + f.commission, 0),
    ),
    brokerPnl: brokerPnls.length ? brokerPnls.reduce((s, v) => s + v, 0) : null,
    truncated: open.truncated,
  };
}

/** Fills must already be deduplicated. */
export function buildRoundTrips(
  fills: TradeFill[],
  keyOf: (fill: TradeFill) => string,
  toBase: (fill: TradeFill, value: number) => number,
  today: string,
): RoundTrip[] {
  const sorted = [...fills].sort(
    (a, b) => a.dateTime.localeCompare(b.dateTime) || a.id.localeCompare(b.id),
  );
  const open = new Map<string, Open>();
  const seq = new Map<string, number>();
  const out: RoundTrip[] = [];

  const close = (key: string, o: Open) => {
    const n = (seq.get(key) ?? 0) + 1;
    seq.set(key, n);
    out.push(finish(key, o, n, today, toBase));
    open.delete(key);
  };

  const queue = [...sorted];
  while (queue.length) {
    const fill = queue.shift()!;
    const key = keyOf(fill);
    let o = open.get(key);
    if (!o) {
      const entryPredatesStatements =
        (fill.brokerPnl !== null && Math.abs(fill.brokerPnl) > EPS) ||
        /^C(;|$)/.test(fill.openClose ?? "");
      o = { fills: [], position: 0, peak: 0, truncated: entryPredatesStatements };
      open.set(key, o);
    }
    const next = o.position + fill.quantity;
    const flips =
      o.position !== 0 && Math.sign(next) === -Math.sign(o.position) && Math.abs(next) > EPS;
    if (flips) {
      const [closing, opening] = splitProRata(fill, -o.position);
      o.fills.push(closing);
      o.position = 0;
      close(key, o);
      queue.unshift(opening);
      continue;
    }
    o.fills.push(fill);
    o.position = Math.abs(next) < EPS ? 0 : next;
    o.peak = Math.max(o.peak, Math.abs(o.position));
    if (o.position === 0) close(key, o);
  }
  for (const [key, o] of open) close(key, o);

  return out.sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id));
}
