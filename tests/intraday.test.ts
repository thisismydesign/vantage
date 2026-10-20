import assert from "node:assert/strict";
import test from "node:test";
import { intradayRange, latestSession } from "../supabase/functions/_shared/intraday.ts";

test("selects the latest exchange-local day across UTC midnight", () => {
  const result = latestSession("TEST", {
    meta: { currency: "USD", exchangeTimezoneName: "America/New_York", previousClose: 100 },
    quotes: [
      { date: "2026-10-14T20:00:00Z", close: 100 },
      { date: "2026-10-15T23:50:00Z", close: 105 },
      { date: "2026-10-16T00:05:00Z", close: 106 },
      { date: "2026-10-16T00:06:00Z", close: null },
    ],
  });
  assert.equal(result.session, "2026-10-15");
  assert.equal(result.points.length, 2);
  assert.equal(result.previousClose, 100);
});

test("falls back to the preceding session rather than first intraday bar", () => {
  const result = latestSession("TEST", {
    meta: { currency: "EUR", exchangeTimezoneName: "Europe/Paris" },
    quotes: [
      { date: "2026-10-15T08:00:00Z", close: 95 },
      { date: "2026-10-14T15:30:00Z", close: 100 },
      { date: "2026-10-15T09:00:00Z", close: 96 },
    ],
  });
  assert.equal(result.previousClose, 100);
  assert.equal(result.points[0][1], 95);
});

test("empty and invalid bars do not manufacture a trading session", () => {
  const result = latestSession("TEST", {
    meta: { currency: "USD", exchangeTimezoneName: "UTC" },
    quotes: [{ date: "2026-10-15T10:00:00Z", close: null }],
  });
  assert.equal(result.session, "");
  assert.equal(result.previousClose, null);
  assert.deepEqual(result.points, []);
});

test("5D keeps five trading sessions, including intraday bars across a weekend", () => {
  const result = intradayRange(
    "TEST",
    {
      meta: { currency: "USD", exchangeTimezoneName: "America/New_York" },
      quotes: ["08", "09", "12", "13", "14", "15"].flatMap((day) => [
        { date: `2026-10-${day}T14:00:00Z`, close: 100 },
        { date: `2026-10-${day}T14:30:00Z`, close: 101 },
      ]),
    },
    "1w",
  );
  assert.equal(result.points.length, 10);
  assert.equal(result.points[0][0], "2026-10-09T14:00:00.000Z");
});

test("1D shows the latest session with data; 24H crosses the day boundary", () => {
  const chart = {
    meta: { currency: "USD", exchangeTimezoneName: "America/New_York" },
    quotes: [
      { date: "2026-10-14T15:59:00Z", close: 90 },
      { date: "2026-10-14T16:00:00Z", close: 100 },
      { date: "2026-10-15T00:05:00Z", close: 101 },
      { date: "2026-10-15T15:00:00Z", close: 102 },
    ],
  };
  const now = Date.parse("2026-10-15T16:00:00Z");
  assert.equal(intradayRange("TEST", chart, "1d", now).points.length, 1);
  assert.equal(intradayRange("TEST", chart, "24h", now).points.length, 3);
  const nextDayWithoutBars = now + 86_400_000;
  assert.equal(intradayRange("TEST", chart, "1d", nextDayWithoutBars).points.length, 1);
});

test("1D preserves exchange opening and early closing times while data is incomplete", () => {
  const result = intradayRange(
    "TEST",
    {
      meta: {
        currency: "USD",
        exchangeTimezoneName: "America/New_York",
        currentTradingPeriod: {
          regular: { start: "2026-11-27T14:30:00Z", end: "2026-11-27T18:00:00Z" },
        },
      },
      quotes: [{ date: "2026-11-27T15:00:00Z", close: 100 }],
    },
    "1d",
    Date.parse("2026-11-27T15:01:00Z"),
  );
  assert.equal(result.marketOpen, "2026-11-27T14:30:00.000Z");
  assert.equal(result.marketClose, "2026-11-27T18:00:00.000Z");
  assert.ok(Date.parse(result.points.at(-1)![0]) < Date.parse(result.marketClose!));
});

test("1D carries the timestamp of the previous close", () => {
  const chart = {
    meta: { currency: "USD", exchangeTimezoneName: "America/New_York", previousClose: 100 },
    quotes: [
      { date: "2026-10-09T19:55:00Z", close: 100 },
      { date: "2026-10-12T13:35:00Z", close: 101 },
    ],
  };
  const open = intradayRange("TEST", chart, "1d", Date.parse("2026-10-12T14:00:00Z"));
  assert.equal(open.previousCloseAt, "2026-10-09T19:55:00.000Z");
  assert.equal(open.points.length, 1);
  const early = intradayRange("TEST", chart, "1d", Date.parse("2026-10-13T12:00:00Z"));
  assert.equal(early.session, "2026-10-12");
  assert.equal(early.points.length, 1);
  assert.equal(early.previousCloseAt, "2026-10-09T19:55:00.000Z");
  assert.equal(early.previousClose, 100);
});

test("24H keeps the open periods that overlap the window", () => {
  const now = Date.parse("2026-10-15T20:00:00Z");
  const result = intradayRange(
    "TEST",
    {
      meta: {
        currency: "USD",
        exchangeTimezoneName: "America/New_York",
        openPeriods: [
          { start: "2026-10-13T08:00:00.000Z", end: "2026-10-14T00:00:00.000Z" },
          { start: "2026-10-14T08:00:00.000Z", end: "2026-10-15T00:00:00.000Z" },
          { start: "2026-10-15T08:00:00.000Z", end: "2026-10-16T00:00:00.000Z" },
        ],
      },
      quotes: [{ date: "2026-10-15T14:00:00Z", close: 100 }],
    },
    "24h",
    now,
  );
  assert.deepEqual(result.openPeriods, [
    ["2026-10-14T08:00:00.000Z", "2026-10-15T00:00:00.000Z"],
    ["2026-10-15T08:00:00.000Z", "2026-10-16T00:00:00.000Z"],
  ]);
});

test("1D keeps pre-market and after-hours bars; the previous close skips after-hours ones", () => {
  const result = intradayRange(
    "TEST",
    {
      meta: {
        currency: "USD",
        exchangeTimezoneName: "America/New_York",
        currentTradingPeriod: {
          pre: { start: "2026-10-15T08:00:00Z", end: "2026-10-15T13:30:00Z" },
          regular: { start: "2026-10-15T13:30:00Z", end: "2026-10-15T20:00:00Z" },
          post: { start: "2026-10-15T20:00:00Z", end: "2026-10-16T00:00:00Z" },
        },
        regularPeriods: [
          { start: "2026-10-14T13:30:00.000Z", end: "2026-10-14T20:00:00.000Z" },
          { start: "2026-10-15T13:30:00.000Z", end: "2026-10-15T20:00:00.000Z" },
        ],
      },
      quotes: [
        { date: "2026-10-14T19:55:00Z", close: 100 },
        { date: "2026-10-14T23:55:00Z", close: 98 },
        { date: "2026-10-15T08:00:00Z", close: 99 },
        { date: "2026-10-15T14:00:00Z", close: 101 },
        { date: "2026-10-15T22:00:00Z", close: 103 },
      ],
    },
    "1d",
    Date.parse("2026-10-15T22:01:00Z"),
  );
  assert.deepEqual(
    result.points.map(([, close]) => close),
    [99, 101, 103],
  );
  assert.equal(result.extendedOpen, "2026-10-15T08:00:00.000Z");
  assert.equal(result.extendedClose, "2026-10-16T00:00:00.000Z");
  assert.equal(result.marketOpen, "2026-10-15T13:30:00.000Z");
  assert.equal(result.previousCloseAt, "2026-10-14T19:55:00.000Z");
  assert.equal(result.previousClose, 100);
});
