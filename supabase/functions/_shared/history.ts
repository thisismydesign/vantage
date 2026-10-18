/**
 * Horizons for the history ranges. The backend cuts each one from the raw series and thins it so every chart shows about the same number of points; the client only places what it gets on a real-time axis.
 */
import type { HistoryRange } from "../../../shared/types.ts";

export const DAY_MS = 86_400_000;
/** Points a chart aims to show: a series keeps at least this many and under twice it. */
export const TARGET_POINTS = 50;

export type Bars = "hourly" | "daily" | "weekly";
/** Each horizon's source bars and calendar span in months (0 = year to date). */
export const RANGE_SOURCE: Record<HistoryRange, { bars: Bars; months: number }> = {
  "1m": { bars: "hourly", months: 1 },
  "3m": { bars: "hourly", months: 3 },
  "6m": { bars: "daily", months: 6 },
  ytd: { bars: "daily", months: 0 },
  "1y": { bars: "daily", months: 12 },
  "5y": { bars: "weekly", months: 60 },
};
export const HISTORY_RANGES = Object.keys(RANGE_SOURCE) as HistoryRange[];

/** Start of a horizon's calendar window that ends at `end`. */
export function windowStart(range: HistoryRange, end: number): number {
  const d = new Date(end);
  const { months } = RANGE_SOURCE[range];
  if (!months) return Date.UTC(d.getUTCFullYear(), 0, 1);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

/**
 * When a bar's close printed. Intraday keys are the bar's time. A daily close is dated its day and sits at the end of it; a weekly close is dated its Monday and lands on Friday.
 */
export function closeTime(key: string, bars: Bars): number {
  const t = Date.parse(key);
  return key.includes("T") ? t : t + (bars === "weekly" ? 5 : 1) * DAY_MS;
}

/** Every k-th point, anchored on the last so the latest bar survives; the first is always kept. */
export function thin<T>(points: T[], target = TARGET_POINTS): { points: T[]; step: number } {
  const step = Math.max(1, Math.floor(points.length / target));
  if (step === 1) return { points, step };
  const last = points.length - 1;
  return { points: points.filter((_, i) => i === 0 || (last - i) % step === 0), step };
}

/**
 * A horizon's points: the last close before its window, so the change covers the whole span and the line enters from the left edge, then everything inside, thinned. Empty when nothing traded inside the window.
 */
export function cutRange(
  src: [string, number][],
  range: HistoryRange,
  now: number,
): [string, number][] {
  const { bars } = RANGE_SOURCE[range];
  const start = windowStart(range, now);
  const inside = src.findIndex(([key]) => closeTime(key, bars) >= start);
  if (inside < 0) return [];
  return thin(src.slice(Math.max(0, inside - 1))).points;
}

export function buildRanges(
  series: Record<Bars, [string, number][]>,
  now: number,
): Record<HistoryRange, [string, number][]> {
  return Object.fromEntries(
    HISTORY_RANGES.map((r) => [r, cutRange(series[RANGE_SOURCE[r].bars], r, now)]),
  ) as Record<HistoryRange, [string, number][]>;
}
