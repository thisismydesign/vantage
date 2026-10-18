import type { IntradaySeries } from "../../../shared/types.ts";

export interface Chart {
  meta: {
    currency: string;
    exchangeTimezoneName: string;
    previousClose?: number;
    currentTradingPeriod?: { regular: { start: Date | string; end: Date | string } };
    /** Merged where they touch; ISO strings. */
    openPeriods?: { start: string; end: string }[];
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
  const previous = points.filter((_, i) => dayOf[i] < session).at(-1);
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
    const showingEarlierSession = series.session && series.session < day.format(now);
    if (showingEarlierSession) {
      const prior = chart.quotes
        .filter((q) => q.close !== null && Number.isFinite(q.close))
        .filter((q) => day.format(new Date(q.date)) < series.session)
        .at(-1);
      if (prior) series.previousClose = prior.close;
    }
    const hours = chart.meta.currentTradingPeriod?.regular;
    if (hours && day.format(new Date(hours.start)) === series.session) {
      series.marketOpen = new Date(hours.start).toISOString();
      series.marketClose = new Date(hours.end).toISOString();
      series.points = series.points.filter(
        ([date]) => date >= series.marketOpen! && date <= series.marketClose!,
      );
    }
  }
  return series;
}
