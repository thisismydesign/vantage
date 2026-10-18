import type { HistoryRange } from "../../../shared/types.ts";

export const DAY_MS = 86_400_000;
export const TARGET_POINTS = 50;

export type Bars = "hourly" | "daily" | "weekly";
/** 0 months = year to date. */
export const RANGE_SOURCE: Record<HistoryRange, { bars: Bars; months: number }> = {
  "1m": { bars: "hourly", months: 1 },
  "3m": { bars: "hourly", months: 3 },
  "6m": { bars: "daily", months: 6 },
  ytd: { bars: "daily", months: 0 },
  "1y": { bars: "daily", months: 12 },
  "5y": { bars: "weekly", months: 60 },
};
export const HISTORY_RANGES = Object.keys(RANGE_SOURCE) as HistoryRange[];

export function windowStart(range: HistoryRange, end: number): number {
  const d = new Date(end);
  const { months } = RANGE_SOURCE[range];
  if (!months) return Date.UTC(d.getUTCFullYear(), 0, 1);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

/** Daily bars are dated their day and close at its end; weekly bars are dated their Monday and close on Friday. */
export function closeTime(key: string, bars: Bars): number {
  const t = Date.parse(key);
  return key.includes("T") ? t : t + (bars === "weekly" ? 5 : 1) * DAY_MS;
}

/** Anchored on the last point so the latest bar survives. */
export function thin<T>(points: T[], target = TARGET_POINTS): { points: T[]; step: number } {
  const step = Math.max(1, Math.floor(points.length / target));
  if (step === 1) return { points, step };
  const last = points.length - 1;
  return { points: points.filter((_, i) => i === 0 || (last - i) % step === 0), step };
}

/** Starts one close before the window so the change spans it and the line enters from the left edge. */
export function cutRange(
  src: [string, number][],
  range: HistoryRange,
  now: number,
): [string, number][] {
  const { bars } = RANGE_SOURCE[range];
  const start = windowStart(range, now);
  const firstInside = src.findIndex(([key]) => closeTime(key, bars) >= start);
  if (firstInside < 0) return [];
  return thin(src.slice(Math.max(0, firstInside - 1))).points;
}

export function buildRanges(
  series: Record<Bars, [string, number][]>,
  now: number,
): Record<HistoryRange, [string, number][]> {
  return Object.fromEntries(
    HISTORY_RANGES.map((r) => [r, cutRange(series[RANGE_SOURCE[r].bars], r, now)]),
  ) as Record<HistoryRange, [string, number][]>;
}
