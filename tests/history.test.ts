import assert from "node:assert/strict";
import test from "node:test";
import { closeTime, windowStart } from "../shared/ranges.ts";
import { cutRange, thin } from "../supabase/functions/_shared/history.ts";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();
const day = (t: number) => iso(t).slice(0, 10);

test("thin keeps the first and last points and lands between the target and twice it", () => {
  for (const n of [10, 49, 50, 78, 147, 441, 720, 2200]) {
    const src = Array.from({ length: n }, (_, i) => i);
    const { points } = thin(src, 50);
    assert.equal(points[0], 0);
    assert.equal(points.at(-1), n - 1);
    if (n >= 50) assert.ok(points.length >= 50 && points.length < 100, `${n} -> ${points.length}`);
    else assert.equal(points.length, n);
  }
});

test("windowStart counts calendar months back, YTD from January 1st", () => {
  const now = Date.UTC(2026, 9, 16, 12);
  assert.equal(day(windowStart("1m", now)), "2026-09-16");
  assert.equal(day(windowStart("1y", now)), "2025-10-16");
  assert.equal(day(windowStart("5y", now)), "2021-10-16");
  assert.equal(day(windowStart("ytd", now)), "2026-01-01");
});

test("closeTime puts a daily close at the end of its day and a weekly one on Friday", () => {
  assert.equal(closeTime("2026-10-15", "daily"), Date.UTC(2026, 9, 16));
  assert.equal(closeTime("2026-10-12", "weekly"), Date.UTC(2026, 9, 17));
  assert.equal(closeTime("2026-10-15T13:30:00.000Z", "hourly"), Date.UTC(2026, 9, 15, 13, 30));
});

test("cutRange leads with the close before the window and drops what is older", () => {
  const now = Date.UTC(2026, 9, 16, 12);
  const daily: [string, number][] = Array.from({ length: 400 }, (_, i) => [
    day(now - (399 - i) * DAY),
    i,
  ]);
  const cut = cutRange(daily, "6m", now);
  const start = windowStart("6m", now);
  assert.ok(closeTime(cut[0][0], "daily") < start, "first point is the baseline before the window");
  assert.ok(closeTime(cut[1][0], "daily") >= start, "second point is inside the window");
  assert.equal(cut.at(-1)?.[1], 399);
  assert.ok(cut.length >= 50 && cut.length < 100);
});

test("cutRange is empty for a listing with no bars inside the window", () => {
  const now = Date.UTC(2026, 9, 16, 12);
  const old: [string, number][] = [
    ["2024-01-02", 1],
    ["2024-01-03", 2],
  ];
  assert.deepEqual(cutRange(old, "1m", now), []);
});
