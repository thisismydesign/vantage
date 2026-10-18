export const PERIODS = [
  { value: "all", label: "All" },
  { value: "1y", label: "1Y" },
  { value: "ytd", label: "YTD" },
  { value: "6m", label: "6M" },
  { value: "3m", label: "3M" },
];

/** YYYY-MM-DD; empty means no cutoff. */
export function cutoff(period: string): string {
  const now = new Date();
  if (period === "ytd") return `${now.getUTCFullYear()}-01-01`;
  const months = { "1y": 12, "6m": 6, "3m": 3 }[period];
  if (!months) return "";
  now.setUTCMonth(now.getUTCMonth() - months);
  return now.toISOString().slice(0, 10);
}
