// The function cuts each range and the app labels it; both MUST agree on the window.

import type { HistoryRange } from "./api.ts";

const DAY_MS = 86_400_000;

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
