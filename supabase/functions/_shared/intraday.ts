import type { IntradaySeries } from "../../../shared/api.ts";

type Period = { start: Date | string; end: Date | string };

export interface Chart {
  meta: {
    currency: string;
    exchangeTimezoneName: string;
    previousClose?: number;
    currentTradingPeriod?: Record<"pre" | "regular" | "post", Period> | { regular: Period };
    /** Merged where they touch; ISO strings. */
    openPeriods?: { start: string; end: string }[];
    /** Regular hours only, so a previous close skips after-hours bars; ISO strings. */
    regularPeriods?: { start: string; end: string }[];
  };
  quotes: { date: Date | string; close: number | null }[];
}

const OUTSIDE_HOURS_MS = 3_600_000;

/**
 * Yahoo's regular hours can end before a closing auction (Seoul, London), so only a listing that trades well beyond them gets `periods`.
 * Otherwise `early` and `late` stretch them over the prints just outside.
 */
export function regularHours(chart: Chart) {
  const periods = chart.meta.regularPeriods ?? [];
  const bounds = periods.map((p) => [Date.parse(p.start), Date.parse(p.end)]);
  let early = 0;
  let late = 0;
  for (const q of chart.quotes) {
    if (q.close === null || !Number.isFinite(q.close) || !bounds.length) continue;
    const t = new Date(q.date).getTime();
    if (bounds.some(([start, end]) => t >= start && t < end)) continue;
    const before = Math.min(...bounds.map(([start]) => (start > t ? start - t : Infinity)));
    const after = Math.min(...bounds.map(([, end]) => (end <= t ? t - end : Infinity)));
    if (Math.min(before, after) > OUTSIDE_HOURS_MS) return { periods, early: 0, late: 0 };
    if (before < after) early = Math.max(early, before);
    else late = Math.max(late, after);
  }
  return { periods: undefined, early, late };
}

export function latestSession(ticker: string, chart: Chart, sessionCount = 1): IntradaySeries {
  const timeZone = chart.meta.exchangeTimezoneName;
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone });
  const day = (date: string) => dayFormat.format(new Date(date));
  const points = chart.quotes
    .filter((q) => q.close !== null && Number.isFinite(q.close))
    .map((q): [string, number] => [new Date(q.date).toISOString(), q.close!])
    .sort((a, b) => a[0].localeCompare(b[0]));
  // Intl formatting is expensive; resolve each bar's day once.
  const dayOf = points.map(([date]) => day(date));
  const session = dayOf.at(-1) ?? "";
  const days = new Set([...new Set(dayOf)].slice(-sessionCount));
  const current = points.filter((_, i) => days.has(dayOf[i]));
  const regular = regularHours(chart).periods;
  const inRegularHours = (date: string) =>
    !regular?.length || regular.some((p) => date >= p.start && date < p.end);
  const previous = points.filter(([date], i) => dayOf[i] < session && inRegularHours(date)).at(-1);
  return {
    ticker,
    currency: chart.meta.currency,
    timeZone,
    session,
    previousCloseAt: previous?.[0],
    previousClose: chart.meta.previousClose ?? previous?.[1] ?? null,
    points: current,
  };
}

export function intradayRange(
  ticker: string,
  chart: Chart,
  range: string,
  now = Date.now(),
): IntradaySeries {
  const series = latestSession(ticker, chart, range === "1w" ? 5 : range === "24h" ? 3 : 1);
  if (range === "24h") {
    series.points = series.points.filter(
      ([date]) => Date.parse(date) >= now - 86_400_000 && Date.parse(date) <= now,
    );
    series.previousClose = null;
    series.openPeriods = chart.meta.openPeriods
      ?.filter((p) => Date.parse(p.end) >= now - 86_400_000 && Date.parse(p.start) <= now)
      .map((p) => [p.start, p.end]);
  }
  if (range === "24h" || range === "1w") {
    const first = series.points[0]?.[0];
    series.regularPeriods = first
      ? regularHours(chart)
          .periods?.filter((p) => p.end > first)
          .map((p) => [p.start, p.end])
      : undefined;
  } else if (range === "1d") {
    // Until today's first bar the previous session shows, so Asian listings do not blank out after their midnight. Yahoo's previousClose is then that session's own close.
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: series.timeZone });
    if (series.session && series.session < day.format(now)) {
      const prior = chart.quotes.find(
        (q) => q.close !== null && new Date(q.date).toISOString() === series.previousCloseAt,
      );
      if (prior) series.previousClose = prior.close;
    }
    const hours = chart.meta.currentTradingPeriod;
    if (hours && day.format(new Date(hours.regular.start)) === series.session) {
      const iso = (date: Date | string, shift = 0) =>
        new Date(new Date(date).getTime() + shift).toISOString();
      const { periods, early, late } = regularHours(chart);
      series.marketOpen = iso(hours.regular.start, -early);
      series.marketClose = iso(hours.regular.end, late);
      const pre = "pre" in hours ? iso(hours.pre.start) : series.marketOpen;
      const post = "post" in hours ? iso(hours.post.end) : series.marketClose;
      if (periods && pre < series.marketOpen) series.extendedOpen = pre;
      if (periods && post > series.marketClose) series.extendedClose = post;
      series.points = series.points.filter(
        ([date]) =>
          date >= (periods ? pre : series.marketOpen!) &&
          date <= (periods ? post : series.marketClose!),
      );
    }
  }
  return series;
}
