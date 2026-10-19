import type { HistoryRange } from "../../../shared/api.ts";
import {
  closeTime,
  HISTORY_RANGES,
  RANGE_SOURCE,
  windowStart,
  type Bars,
} from "../../../shared/ranges.ts";

export const TARGET_POINTS = 50;

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
