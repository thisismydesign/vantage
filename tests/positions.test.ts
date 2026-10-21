import assert from "node:assert/strict";
import test from "node:test";
import type { ChartsResponse, IntradaySeries } from "../shared/api.ts";
import {
  buildPositions,
  totalsOf,
  type Display,
  type Fill,
  type Holding,
  type Period,
} from "../app/src/lib/positions.ts";

const near = (actual: number | null, expected: number) =>
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

const position = (p: Partial<Holding>): Holding => ({
  account_id: "U1",
  symbol: "ASML",
  description: "ASML Holding",
  asset_category: "STK",
  currency: "EUR",
  quantity: 10,
  position_value: 6_000,
  cost_basis: 5_000,
  fx_rate_to_base: 1,
  ...p,
});

const fill = (f: Partial<Fill>): Fill => ({
  traded_at: "2026-10-20T10:00:00",
  account_id: "U1",
  symbol: "ASML",
  asset_category: "STK",
  currency: "EUR",
  quantity: 4,
  net_cash: -2_442,
  fx_rate_to_base: 1,
  ...f,
});

/** Previous close 600 on the 19th at 17:30 Amsterdam; trades at 650 now. */
const asml: IntradaySeries = {
  ticker: "ASML",
  currency: "EUR",
  timeZone: "Europe/Amsterdam",
  session: "regular",
  previousClose: 600,
  previousCloseAt: "2026-10-19T15:30:00Z",
  previousCloseConverted: { EUR: 600, USD: 660 },
  points: [
    ["2026-10-20T07:00:00Z", 620],
    ["2026-10-20T15:00:00Z", 650],
  ],
  converted: { EUR: [620, 650], USD: [682, 702] },
};
const nvda: IntradaySeries = {
  ticker: "NVDA",
  currency: "USD",
  timeZone: "America/New_York",
  session: "regular",
  previousClose: 100,
  previousCloseAt: "2026-10-19T20:00:00Z",
  previousCloseConverted: { EUR: 90, USD: 100 },
  points: [["2026-10-20T19:00:00Z", 110]],
  converted: { EUR: [88], USD: [110] },
};

const day: ChartsResponse = {
  asOf: "2026-10-20T15:00:00Z",
  range: "1d",
  ttlMs: 0,
  themes: [],
  items: [],
  series: { ASML: asml, NVDA: nvda },
  fetchedAt: {},
  errors: {},
};

const snapshot = (positions: Holding[]) => ({ as_of: "2026-10-20", positions });

const build = (
  positions: Holding[],
  options: {
    fills?: Fill[];
    display?: Display;
    period?: Period;
    periodData?: ChartsResponse;
  } = {},
) =>
  buildPositions({
    snapshot: snapshot(positions),
    fills: options.fills ?? [],
    day,
    periodData: options.periodData,
    period: options.period ?? "1d",
    display: options.display ?? "EUR",
    base: "EUR",
    resolve: (s) => s,
    names: new Map(),
  });

test("a position held all day gains its quantity times the move", () => {
  const [line] = build([position({})]);
  near(line.value, 6_500);
  near(line.unrealized, 1_500);
  near(line.unrealizedPct, 0.3);
  near(line.change, 650 / 600 - 1);
  near(line.periodPnl, 500);
});

test("shares bought inside the period gain only from their price, net of commission", () => {
  const [line] = build([position({ quantity: 14 })], { fills: [fill({})] });
  // 10 held from 600, 4 bought at 610 for 2,442 with commission.
  near(line.periodPnl, 14 * 650 - 10 * 600 - 2_442);
});

test("a fill before the period's start is already in its opening quantity", () => {
  const [line] = build([position({})], {
    fills: [fill({ traded_at: "2026-10-19T16:00:00" })],
  });
  near(line.periodPnl, 500);
});

test("display currencies convert at each point's rate, native keeps the listing's", () => {
  const nvdaRow = position({ symbol: "NVDA", currency: "USD", quantity: 10, cost_basis: 800 });
  const [eur] = build([nvdaRow]);
  near(eur.value, 880);
  near(eur.periodPnl, 880 - 900);
  near(eur.unrealized, 880 - 800 * 0.8);
  const [native] = build([nvdaRow], { display: "native" });
  assert.equal(native.currency, "USD");
  near(native.value, 1_100);
  near(native.periodPnl, 100);
});

test("history periods start at the range's first bar and take fills after its day", () => {
  const history: ChartsResponse = {
    ...day,
    range: "history",
    series: {
      ASML: {
        symbol: "ASML",
        currency: "EUR",
        ranges: {
          "1m": { points: [["2026-09-20", 500]] },
        } as never,
      },
    },
  };
  const [line] = build([position({ quantity: 14 })], {
    period: "1m",
    periodData: history,
    fills: [fill({ traded_at: "2026-09-20T12:00:00" }), fill({})],
  });
  near(line.change, 650 / 500 - 1);
  near(line.periodPnl, 14 * 650 - 10 * 500 - 2_442);
});

test("without the period's prices the move stays unknown", () => {
  const [line] = build([position({})], { period: "1w" });
  assert.equal(line.change, null);
  assert.equal(line.periodPnl, null);
  near(line.value, 6_500);
});

test("totals move as today's holdings would have, held all period; P&L counts the trades", () => {
  const lines = build(
    [position({ quantity: 14 }), position({ symbol: "NVDA", currency: "USD", cost_basis: 800 })],
    { fills: [fill({})] },
  );
  const totals = totalsOf(lines);
  near(totals.value, 9_100 + 880);
  near(totals.periodPnl, 9_100 - 6_000 - 2_442 - 20);
  near(totals.change, (9_100 + 880 - 8_400 - 900) / (8_400 + 900));
});
