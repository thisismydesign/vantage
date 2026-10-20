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

export function latestSession(ticker: string, chart: Chart, sessionCount = 1): IntradaySeries {
  const timeZone = chart.meta.exchangeTimezoneName;
  const day = (date: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(date));
  const points = chart.quotes
    .filter((q) => q.close !== null && Number.isFinite(q.close))
    .map((q): [string, number] => [new Date(q.date).toISOString(), q.close!])
    .sort((a, b) => a[0].localeCompare(b[0]));
  // Intl formatting is expensive; resolve each bar's day once.
  const dayOf = points.map(([date]) => day(date));
  const session = dayOf.at(-1) ?? "";
  const days = new Set([...new Set(dayOf)].slice(-sessionCount));
  const current = points.filter((_, i) => days.has(dayOf[i]));
  const regular = chart.meta.regularPeriods;
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
      const iso = (date: Date | string) => new Date(date).toISOString();
      series.marketOpen = iso(hours.regular.start);
      series.marketClose = iso(hours.regular.end);
      const pre = "pre" in hours ? iso(hours.pre.start) : series.marketOpen;
      const post = "post" in hours ? iso(hours.post.end) : series.marketClose;
      if (pre < series.marketOpen) series.extendedOpen = pre;
      if (post > series.marketClose) series.extendedClose = post;
      series.points = series.points.filter(([date]) => date >= pre && date <= post);
    }
  }
  return series;
}
