import type { TradeClose, TradeFill, TradeName } from "../types.ts";

const EPS = 1e-9;

interface Lot {
  quantity: number;
  unitCostWithCommission: number;
  unitCostWithCommissionBase: number;
}

/**
 * FIFO, matching the broker. Realised P&L comes from the broker's closes so it agrees with the closes view to the cent.
 */
export function buildNames(
  fills: TradeFill[],
  closes: TradeClose[],
  keyOf: (fill: TradeFill) => string,
  roundTripsOf: (key: string) => { count: number; truncated: boolean },
  toBase: (fill: TradeFill, value: number) => number,
): TradeName[] {
  const groups = new Map<string, TradeFill[]>();
  for (const f of [...fills].sort(
    (a, b) => a.dateTime.localeCompare(b.dateTime) || a.id.localeCompare(b.id),
  )) {
    const k = keyOf(f);
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const closesByKey = new Map<string, TradeClose[]>();
  for (const c of closes) {
    const f = fills.find((x) => x.id === c.id);
    if (!f) continue;
    const k = keyOf(f);
    closesByKey.set(k, [...(closesByKey.get(k) ?? []), c]);
  }

  const out: TradeName[] = [];
  for (const [key, rows] of groups) {
    const lots: Lot[] = [];
    let peakCostBase = 0;
    for (const f of rows) {
      const perUnitCommission = f.commission / Math.abs(f.quantity);
      let remaining = f.quantity;
      while (
        Math.abs(remaining) > EPS &&
        lots.length &&
        Math.sign(lots[0].quantity) !== Math.sign(remaining)
      ) {
        const lot = lots[0];
        const take =
          Math.min(Math.abs(remaining), Math.abs(lot.quantity)) * Math.sign(lot.quantity);
        lot.quantity -= take;
        remaining += take;
        if (Math.abs(lot.quantity) < EPS) lots.shift();
      }
      if (Math.abs(remaining) > EPS) {
        const unitCost = f.price - perUnitCommission * Math.sign(remaining);
        lots.push({
          quantity: remaining,
          unitCostWithCommission: unitCost,
          unitCostWithCommissionBase: toBase(f, unitCost),
        });
      }
      const held = lots.reduce(
        (s, l) => s + Math.abs(l.quantity * l.unitCostWithCommissionBase),
        0,
      );
      if (held > peakCostBase) peakCostBase = held;
    }

    const first = rows[0];
    const last = rows[rows.length - 1];
    const openQuantity = lots.reduce((s, l) => s + l.quantity, 0);
    const nameCloses = closesByKey.get(key) ?? [];
    const trips = roundTripsOf(key);
    out.push({
      ticker: first.ticker,
      symbol: first.symbol,
      description: first.description,
      currency: first.currency,
      firstAt: first.dateTime,
      lastAt: last.dateTime,
      roundTrips: trips.count,
      closes: nameCloses.length,
      closeWins: nameCloses.filter((c) => c.pnlBase > 0).length,
      status: Math.abs(openQuantity) < EPS ? "closed" : "held",
      openQuantity: Math.abs(openQuantity) < EPS ? 0 : openQuantity,
      openCost: lots.reduce((s, l) => s + l.quantity * l.unitCostWithCommission, 0),
      openCostBase: lots.reduce((s, l) => s + l.quantity * l.unitCostWithCommissionBase, 0),
      peakCostBase,
      realisedBase: nameCloses.reduce((s, c) => s + c.pnlBase, 0),
      truncated: trips.truncated,
    });
  }
  return out.sort((a, b) => b.realisedBase - a.realisedBase);
}
