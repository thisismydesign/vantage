import assert from "node:assert/strict";
import test from "node:test";
import { convert, convertSeries, rateAt } from "../supabase/functions/_shared/fx.ts";

const rates = {
  EUR: [
    ["2026-10-14T00:00:00.000Z", 0.9],
    ["2026-10-15T00:00:00.000Z", 0.8],
  ] as [string, number][],
  GBP: [["2026-10-14T00:00:00.000Z", 0.75]] as [string, number][],
};

test("rateAt takes the last rate at or before the key, else the first", () => {
  assert.equal(rateAt(rates.EUR, "2026-10-14T12:00:00.000Z"), 0.9);
  assert.equal(rateAt(rates.EUR, "2026-10-15T00:00:00.000Z"), 0.8);
  assert.equal(rateAt(rates.EUR, "2026-10-13T00:00:00.000Z"), 0.9);
  assert.equal(rateAt([], "2026-10-13T00:00:00.000Z"), null);
});

test("convert pivots through USD with the rate valid at that time", () => {
  // 100 GBP → USD at 0.75 → 133.33 USD → EUR at 0.9 → 120 EUR.
  assert.equal(convert(100, "GBP", "EUR", "2026-10-14T12:00:00.000Z", rates)?.toFixed(2), "120.00");
  assert.equal(convert(100, "GBP", "EUR", "2026-10-15T12:00:00.000Z", rates)?.toFixed(2), "106.67");
  assert.equal(convert(100, "USD", "EUR", "2026-10-15T12:00:00.000Z", rates), 80);
  assert.equal(convert(100, "EUR", "EUR", "2026-10-15T12:00:00.000Z", rates), 100);
  assert.equal(convert(100, "KRW", "EUR", "2026-10-15T12:00:00.000Z", rates), null);
});

test("convertSeries aligns every base with the points", () => {
  const out = convertSeries(
    [
      ["2026-10-14T10:00:00.000Z", 10],
      ["2026-10-15T10:00:00.000Z", 10],
    ],
    "USD",
    rates,
  );
  assert.deepEqual(out.USD, [10, 10]);
  assert.deepEqual(out.EUR, [9, 8]);
});
