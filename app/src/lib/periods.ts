import type { HistoryRange } from "@shared/api.ts";
import { HISTORY_RANGES, windowStart } from "@shared/ranges.ts";

export const PERIODS = [
  { value: "all", label: "All" },
  { value: "1y", label: "1Y" },
  { value: "ytd", label: "YTD" },
  { value: "6m", label: "6M" },
  { value: "3m", label: "3M" },
];

/** YYYY-MM-DD; empty means no cutoff. */
export function cutoff(period: string): string {
  if (!(HISTORY_RANGES as string[]).includes(period)) return "";
  return new Date(windowStart(period as HistoryRange, Date.now())).toISOString().slice(0, 10);
}
