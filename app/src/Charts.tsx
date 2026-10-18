import { AreaChart } from "@mantine/charts";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Collapse,
  Divider,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Popover,
  RingProgress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconAdjustmentsHorizontal, IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import type { BaseCurrency, HistoryRange, IntradaySeries, VantageHistory } from "@shared/types.ts";
import {
  closeTime,
  DAY_MS,
  RANGE_SOURCE,
  windowStart,
  type Bars,
} from "../../supabase/functions/_shared/history.ts";
import { displayDateTime, signedPct } from "./lib/format.ts";
import { useLocalState } from "./lib/useLocalState.ts";
import { TONE } from "./theme.ts";
import {
  dateTicks,
  groupMiddles,
  hourTicks,
  niceTicks,
  slotTicks,
  stepDecimals,
  thin,
} from "./lib/axis.ts";
import {
  asHistory,
  asSession,
  CONFIGURED,
  useChartData,
  type ChartItem,
  type ChartRange,
  type ChartTheme,
} from "./lib/api.ts";
import { VantageBar } from "./Header.tsx";
import { useSession } from "./lib/supabase.ts";
import { WATCHLIST_CHANGED } from "./Watchlist.tsx";
import { listQuotes, useHeld, WatchTable } from "./WatchTable.tsx";

const REFRESH_MS = 60_000;
/** Shared so the search sits over its status. */
const MIDDLE_WIDTH = 400;
/** Equal side tracks keep the centre column at the page centre in every row. */
const TOOLBAR_ROW = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
  alignItems: "center",
  columnGap: 12,
} as const;
const INTRADAY_RANGES = new Set<string>(["1d", "24h", "1w"]);

const RANGES: { value: "1d" | "24h" | "1w" | HistoryRange; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "24h", label: "24H" },
  { value: "1w", label: "5D" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
];
export type Display = BaseCurrency | "native";
/** Closures at their true width, or folded so every bar gets an equal slot. */
type Gaps = "real" | "short";

/** `value` is in the display currency; `native` is the quote as traded. */
type Point = { date: string; value: number | null; native: number };
/** `start`/`end` bound the calendar window, in ms. */
type Saved = {
  points: Point[];
  start: number;
  end: number;
  bars: Bars;
  currency?: string;
  native?: string;
};
/** `x` is the bar's time intraday, the end of its day or week on history. A null `value` is a gap in trading; `bridge` draws the faded line across a closure. */
type Row = {
  x: number;
  date: string;
  value: number | null;
  native?: number;
  previousClose?: boolean;
  bridge?: number;
};
type Bar = Row & { value: number };

function rangeCloses(
  h: VantageHistory | undefined,
  range: HistoryRange,
  base: Display,
  asOf: string,
): Saved {
  const end = Date.parse(asOf);
  const empty = { points: [], start: windowStart(range, end), end, bars: RANGE_SOURCE[range].bars };
  const src = h?.ranges?.[range];
  if (!h || !src?.points.length) return empty;
  const converted = base !== "native" && h.currency !== base ? src.converted?.[base] : undefined;
  const points = src.points.map(([date, native], i) => ({
    date,
    native,
    value: converted ? (converted[i] ?? null) : native,
  }));
  return { ...empty, points, currency: converted ? base : h.currency, native: h.currency };
}

/** The gap row repeats the bar before it so the bridge line has no break. */
function bridged(rows: Row[]): Row[] {
  rows.forEach((row, i) => {
    const before = rows[i - 1];
    const after = rows[i + 1];
    if (row.value != null || before?.value == null || after?.value == null) return;
    before.bridge = before.value;
    row.bridge = before.value;
    after.bridge = after.value;
  });
  return rows;
}

const EMPTY: Saved = { points: [], start: 0, end: 0, bars: "daily" };
const NO_ITEMS: ChartItem[] = [];
const NO_THEMES: ChartTheme[] = [];
const price = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
function money(value: number, currency?: string) {
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  if (!currency) return value.toLocaleString(undefined, { maximumFractionDigits: digits });
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${price(value)} ${currency}`;
  }
}

const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const PREV_CLOSE_LEAD_MS = 30 * 60_000;
const FALLBACK_PAUSE_MS = 45 * 60_000;

const TickerChart = memo(function TickerChart({
  ticker,
  item,
  session,
  saved,
  range,
  compact,
  asOf,
  base,
  gaps,
}: {
  ticker: string;
  gaps: Gaps;
  base: Display;
  asOf: string;
  item: ChartItem | undefined;
  session: IntradaySeries | undefined;
  saved: Saved;
  range: string;
  compact: boolean;
}) {
  const isIntraday = INTRADAY_RANGES.has(range);
  const clockAxis = range === "1d" || range === "24h";
  // Date-only history stays in UTC so a close dated "2026-10-13" never shifts to the 12th.
  const timeZone = session ? LOCAL_TIME_ZONE : "UTC";

  // The backend converts only when it has rates.
  const sessionConverted =
    session && base !== "native" && session.currency !== base
      ? session.converted?.[base]
      : undefined;
  const sessionBaseline = session
    ? sessionConverted && base !== "native"
      ? (session.previousCloseConverted?.[base] ?? null)
      : session.previousClose
    : null;

  const rows = useMemo((): Row[] => {
    const points: Point[] = session
      ? session.points.map(([date, native], i) => ({
          date,
          native,
          value: sessionConverted ? (sessionConverted[i] ?? null) : native,
        }))
      : isIntraday
        ? []
        : saved.points;
    const bars = points.map((p) => ({
      ...p,
      x: session ? Date.parse(p.date) : Math.min(closeTime(p.date, saved.bars), saved.end),
    }));
    if (range === "24h") {
      // Only exchange closures break the line, so thin names with quiet stretches read as one line.
      // Feeds report 24/7 markets as daily periods a minute apart; merge those.
      const open: [number, number][] = [];
      for (const [s, e] of (session?.openPeriods ?? [])
        .map(([s, e]): [number, number] => [Date.parse(s), Date.parse(e)])
        .sort((a, b) => a[0] - b[0])) {
        const last = open.at(-1);
        if (last && s <= last[1] + 10 * 60_000) last[1] = Math.max(last[1], e);
        else open.push([s, e]);
      }
      const stretch = (x: number) => open.findIndex(([s, e]) => x >= s && x <= e);
      const closedBetween = (a: number, b: number) =>
        open.length ? stretch(a) !== stretch(b) : b - a > FALLBACK_PAUSE_MS;
      return bridged(
        bars.flatMap((bar, i) => {
          const next = bars[i + 1];
          return next && closedBetween(bar.x, next.x)
            ? [bar, { x: bar.x + 1, date: "", value: null }]
            : [bar];
        }),
      );
    }
    if (range === "1w") {
      const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: session?.timeZone });
      // Round-the-clock markets cross midnight without a pause, so a day change alone is no gap.
      const pause = 2 * (session?.intervalMinutes ?? 30) * 60_000;
      return bridged(
        bars.flatMap((bar, i) => {
          const next = bars[i + 1];
          return next &&
            next.x - bar.x > pause &&
            dayKey.format(new Date(bar.date)) !== dayKey.format(new Date(next.date))
            ? [bar, { x: bar.x + 1, date: "", value: null }]
            : [bar];
        }),
      );
    }
    const open = session?.marketOpen ? Date.parse(session.marketOpen) : bars[0]?.x;
    if (range !== "1d" || sessionBaseline == null || open == null) return bars;
    return bridged([
      {
        x: open - PREV_CLOSE_LEAD_MS,
        date: session!.previousCloseAt ?? "",
        value: sessionBaseline,
        native: session!.previousClose ?? undefined,
        previousClose: true,
      },
      // Right after the close, so the bridge runs straight to the open.
      { x: open - PREV_CLOSE_LEAD_MS + 1, date: "", value: null },
      ...bars,
    ]);
  }, [session, sessionConverted, sessionBaseline, isIntraday, saved, range]);

  // 1D is one session either way.
  const short = gaps === "short" && range !== "1d";
  const plotted = useMemo(
    () => (short ? rows.map((r, i) => ({ ...r, x: i })) : rows),
    [rows, short],
  );

  const isBar = (row: Row): row is Bar => row.value != null && !row.previousClose;
  const bars = rows.filter(isBar);
  const last = bars.at(-1);
  const previousCloseRow = rows[0]?.previousClose ? rows[0] : undefined;
  const baseline = range === "1d" ? sessionBaseline : bars[0]?.value;
  const change = last && baseline ? last.value / baseline - 1 : null;
  const delta = last && baseline ? last.value - baseline : null;
  const colour = TONE[change == null ? "neutral" : change >= 0 ? "positive" : "negative"];
  const native = session?.currency ?? saved.native ?? item?.currency ?? undefined;
  const currency = session ? (sessionConverted ? base : session.currency) : saved.currency;
  const nativeTag =
    last && native && currency !== native ? money(last.native ?? last.value, native) : undefined;

  const formats = useMemo(() => {
    const make = (options: Intl.DateTimeFormatOptions, zone = timeZone) =>
      new Intl.DateTimeFormat(undefined, { timeZone: zone, ...options });
    return {
      // Hourly history bars carry a time, so they read in the browser's zone.
      localDayTime: make(
        {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        },
        LOCAL_TIME_ZONE,
      ),
      time: make({ hour: "2-digit", minute: "2-digit", hour12: false }),
      day: make({ month: "short", day: "numeric" }),
      dayYear: make({ month: "short", day: "numeric", year: "numeric" }),
      month: make({ month: "short" }),
      monthYear: make({ month: "short", year: "numeric" }),
      year: make({ year: "numeric" }),
    };
  }, [timeZone]);

  const axes = useMemo(() => {
    const values = rows.flatMap((p) => (p.value == null ? [] : [p.value]));
    if (baseline != null) values.push(baseline);
    const yTicks = niceTicks(Math.min(...values), Math.max(...values), compact ? 3 : 4);
    const yDomain: [number, number] = [yTicks[0] ?? 0, yTicks.at(-1) ?? 0];
    const decimals =
      yTicks.length > 1 ? stepDecimals(Number((yTicks[1] - yTicks[0]).toPrecision(10))) : 2;
    const maxLabels = compact ? 3 : 5;
    const sessionBounds =
      range === "1d" && session?.marketOpen && session?.marketClose
        ? [Date.parse(session.marketOpen), Date.parse(session.marketClose)]
        : undefined;
    // A listing younger than the window leaves the left empty on purpose.
    const end = Date.parse(asOf);
    const window: [number, number] | undefined = short
      ? [rows[0]?.x ?? end, rows.at(-1)?.x ?? end]
      : range === "24h"
        ? [end - DAY_MS, end]
        : range === "1w"
          ? [rows[0]?.x ?? end, end]
          : !isIntraday
            ? [Math.min(saved.start, rows[0]?.x ?? saved.start), saved.end]
            : undefined;
    const first = window?.[0] ?? rows[0]?.x ?? 0;
    const lastX = window?.[1] ?? rows.at(-1)?.x ?? 0;
    const spanDays = (lastX - first) / DAY_MS;
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: session?.timeZone });
    const dated = rows.flatMap((p, slot) => (p.value == null ? [] : [{ ...p, slot }]));
    const dates = !clockAxis && range !== "1w" ? dateTicks(first, lastX, maxLabels) : undefined;
    // Short gaps later drop hours inside closures, so start from every hour.
    const xTicks = clockAxis
      ? hourTicks(
          sessionBounds?.[0] ?? first,
          sessionBounds?.[1] ?? lastX,
          timeZone,
          short ? Infinity : maxLabels,
        )
      : range === "1w"
        ? groupMiddles(
            dated.map((p) => (short ? p.slot : p.x)),
            dated.map((p) => dayKey.format(new Date(p.date))),
            maxLabels,
          )
        : dates!.ticks;
    const xDomain: [number, number] = sessionBounds
      ? [previousCloseRow?.x ?? sessionBounds[0], sessionBounds[1]]
      : [first, lastX];
    const timeLabel = (x: number) => {
      if (clockAxis) return formats.time.format(x);
      if (range === "1w" || dates?.unit === "day") return formats.day.format(x);
      if (dates?.unit === "year") return formats.year.format(x);
      return (spanDays > 180 ? formats.monthYear : formats.month).format(x);
    };
    const rowLabel = (row: Row) => {
      const date = new Date(row.date);
      if (row.previousClose && !row.date) return "Previous close";
      if (session) return `${formats.day.format(date)}, ${formats.time.format(date)}`;
      return row.date.includes("T")
        ? formats.localDayTime.format(date)
        : formats.dayYear.format(date);
    };
    if (!short) return { yTicks, yDomain, decimals, xTicks, xDomain, xLabel: timeLabel, rowLabel };
    const slots =
      range === "1w"
        ? undefined
        : slotTicks(
            xTicks,
            rows.map((r) => r.x),
            range === "24h" ? (session?.intervalMinutes ?? 30) * 60_000 : Infinity,
          );
    return {
      yTicks,
      yDomain,
      decimals,
      xTicks: slots ? thin([...slots.keys()], maxLabels) : xTicks,
      xDomain: [0, rows.length - 1] as [number, number],
      xLabel: (slot: number) => timeLabel(slots?.get(slot) ?? rows[Math.round(slot)]?.x ?? 0),
      rowLabel,
    };
  }, [
    short,
    rows,
    previousCloseRow,
    baseline,
    compact,
    range,
    session,
    clockAxis,
    isIntraday,
    saved,
    timeZone,
    formats,
    asOf,
  ]);

  const yLabel = (value: number) =>
    value.toLocaleString(undefined, {
      maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : axes.decimals,
      minimumFractionDigits: Math.abs(value) >= 10_000 ? 0 : axes.decimals,
      notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    });

  return (
    <Card withBorder padding={compact ? "xs" : "lg"} radius="md" style={{ minWidth: 0 }}>
      {compact ? (
        <>
          {/* Bottom margin keeps the header clear of the chart's top axis label. */}
          <Group justify="space-between" gap="xs" wrap="nowrap" align="baseline" mb={6}>
            <Group gap={4} wrap="nowrap" align="baseline" style={{ minWidth: 0 }}>
              <Text size="sm" fw={700}>
                {ticker}
              </Text>
              <Text size="sm" c="dimmed">
                ·
              </Text>
              <Text size="sm" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                {last ? money(last.value, currency) : "—"}
              </Text>
              {nativeTag && (
                <>
                  <Text size="xs" c="dimmed">
                    ·
                  </Text>
                  <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {nativeTag}
                  </Text>
                </>
              )}
            </Group>
            <Text size="sm" fw={600} c={colour} style={{ whiteSpace: "nowrap" }}>
              {change == null ? "—" : `${change >= 0 ? "▲" : "▼"} ${signedPct(change)}`}
            </Text>
          </Group>
        </>
      ) : (
        <>
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2}>
              <Text size="lg" fw={600}>
                {item?.name ?? ticker}
              </Text>
              <Text size="xs" c="dimmed">
                {ticker} · {currency ?? ""}
              </Text>
            </Stack>
          </Group>
          <Group gap="md" align="baseline" mt="sm">
            <Text fz={30} fw={500} style={{ fontVariantNumeric: "tabular-nums" }}>
              {last ? money(last.value, currency) : "—"}
            </Text>
            {nativeTag && (
              <Text size="sm" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
                {nativeTag}
              </Text>
            )}
            <Text c={colour} fw={500}>
              {change == null
                ? "—"
                : `${change >= 0 ? "▲" : "▼"} ${signedPct(change)} (${delta! >= 0 ? "+" : ""}${price(delta!)})`}{" "}
              <Text span c="dimmed" size="sm">
                {range === "1d" ? "vs previous close" : "in this period"}
              </Text>
            </Text>
          </Group>
        </>
      )}
      {bars.length < 2 ? (
        <Text size="sm" c="dimmed" py={compact ? "sm" : "xl"}>
          No prices available for this period.
        </Text>
      ) : (
        <AreaChart
          h={compact ? 110 : 240}
          withXAxis
          withYAxis
          data={plotted}
          dataKey="x"
          series={[
            { name: "value", color: colour, label: ticker },
            ...(rows.some((r) => r.bridge != null)
              ? [{ name: "bridge", color: colour, strokeDasharray: "3 3" }]
              : []),
          ]}
          areaProps={(series) =>
            series.name === "bridge"
              ? { fill: "none", strokeOpacity: 0.45, strokeWidth: 1.5, activeDot: false }
              : {}
          }
          curveType="linear"
          withDots={false}
          strokeWidth={2}
          withLegend={false}
          withGradient
          connectNulls={false}
          fillOpacity={0.15}
          gridAxis="x"
          strokeDasharray="0"
          tickLine="none"
          activeDotProps={{ r: 4, strokeWidth: 2 }}
          yAxisProps={{
            domain: axes.yDomain,
            ticks: axes.yTicks,
            interval: 0,
            orientation: "right",
            width: compact ? 40 : 56,
            tick: { fontSize: compact ? 10 : 12, fill: "var(--mantine-color-dimmed)" },
            tickFormatter: yLabel,
          }}
          xAxisProps={{
            type: "number",
            domain: axes.xDomain,
            ticks: axes.xTicks,
            allowDataOverflow: true,
            interval: 0,
            tick: { fontSize: compact ? 10 : 12, fill: "var(--mantine-color-dimmed)" },
            tickFormatter: axes.xLabel,
          }}
          referenceLines={
            range === "1d" && baseline != null
              ? [
                  {
                    y: baseline,
                    strokeDasharray: "3 3",
                    color: TONE.neutral,
                    label: compact
                      ? undefined
                      : {
                          value: `Prev close ${price(baseline)}`,
                          fill: "var(--mantine-color-dimmed)",
                          fontSize: 11,
                        },
                    labelPosition: "insideBottomLeft",
                  },
                ]
              : []
          }
          tooltipProps={{
            cursor: { stroke: "var(--mantine-color-dimmed)", strokeWidth: 1 },
            content: ({ payload }) => {
              const hovered = (payload?.[0]?.payload ?? null) as Row | null;
              const row = hovered?.value == null ? previousCloseRow : hovered;
              if (row?.value == null) return null;
              const move = baseline ? row.value / baseline - 1 : null;
              return (
                <Paper withBorder shadow="sm" px="sm" py={6}>
                  <Text size="sm" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {money(row.value, currency)}{" "}
                    {move != null && (
                      <Text span size="xs" fw={500} c={colour}>
                        {signedPct(move)}
                      </Text>
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {axes.rowLabel(row)}
                  </Text>
                </Paper>
              );
            },
          }}
        />
      )}
    </Card>
  );
});

/** Owns its 1s tick so nothing else re-renders. */
function RefreshRing({
  cycle,
  live,
  failed,
  onRefresh,
  updating,
}: {
  cycle: number;
  live: boolean;
  failed: boolean;
  onRefresh: () => void;
  updating: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  const remaining = Math.max(0, Math.ceil((cycle + REFRESH_MS - now) / 1000));
  if (updating) return <Loader size={22} m={3} aria-label="Refreshing prices" />;
  return (
    <RingProgress
      size={28}
      thickness={3}
      roundCaps
      component="button"
      onClick={onRefresh}
      title="Refresh now"
      style={{ cursor: "pointer", background: "none", border: 0, padding: 0 }}
      sections={[
        {
          value: live ? (remaining / (REFRESH_MS / 1000)) * 100 : 0,
          color: failed ? TONE.warning : TONE.info,
        },
      ]}
      aria-label={live ? `Next refresh in ${remaining} seconds` : "Live updates paused"}
      label={
        <Text ta="center" fz={10} c="dimmed">
          {live ? "↻" : "Ⅱ"}
        </Text>
      }
    />
  );
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/** `header` is for hosts without the standalone app shell. */
export function Charts({ header = true }: { header?: boolean }) {
  const [liveUpdates, setLiveUpdates] = useLocalState("charts:liveUpdates", true);
  const [view, setView] = useLocalState<"compact" | "detailed" | "list">("charts:view", "compact");
  const compact = view === "compact";
  const list = view === "list";
  const [base, setBase] = useLocalState<Display>("charts:base", "EUR");
  const [range, setRange] = useLocalState("charts:range:v2", "24h");
  const [selected, setSelected] = useLocalState<string[]>("charts:tickers", []);
  const [grouped, setGrouped] = useLocalState("charts:grouped", true);
  const [gaps, setGaps] = useLocalState<Gaps>("charts:gaps", "real");
  // Not persisted: every visit opens with all groups expanded.
  const [collapsedThemes, setCollapsedThemes] = useState<string[]>([]);

  const isIntraday = list || INTRADAY_RANGES.has(range);
  // One state change per minute; the per-second countdown lives in RefreshRing.
  const [cycle, setCycle] = useState(() => Date.now());
  useEffect(() => {
    if (!liveUpdates || !isIntraday) return;
    const due = () => Date.now() - cycle >= REFRESH_MS;
    const timer = window.setTimeout(() => {
      if (!document.hidden) setCycle(Date.now());
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden && due()) setCycle(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [liveUpdates, isIntraday, cycle]);
  const refresh = useCallback(() => setCycle(Date.now()), []);
  // History is cached for hours upstream, so the list refetches it only when the watchlist changes.
  const [historyCycle, setHistoryCycle] = useState(() => Date.now());
  useEffect(() => {
    const changed = () => {
      refresh();
      setHistoryCycle(Date.now());
    };
    window.addEventListener(WATCHLIST_CHANGED, changed);
    return () => window.removeEventListener(WATCHLIST_CHANGED, changed);
  }, [refresh]);

  const activeRange = RANGES.find((r) => r.value === range) ?? RANGES[0];
  const apiRange: ChartRange = list ? "1d" : isIntraday ? (range as ChartRange) : "history";
  const session = useSession();
  const { data, status, updating } = useChartData(apiRange, cycle, session?.access_token);
  const week = useChartData(list ? "1w" : null, cycle, session?.access_token);
  const history = useChartData(list ? "history" : null, historyCycle, session?.access_token);
  // A cached response for another range must not render under this one.
  const live = data?.range === apiRange ? data : undefined;
  // The watchlist is the same in every response, so the last one keeps the controls usable.
  const items = (live ?? data)?.items ?? NO_ITEMS;
  const themes = (live ?? data)?.themes ?? NO_THEMES;
  const failedTickers = Object.keys(live?.errors ?? {});

  const available = useMemo(() => items.map((i) => i.ticker), [items]);
  const itemByTicker = useMemo(() => new Map(items.map((i) => [i.ticker, i])), [items]);

  const shown = useMemo(
    () => (selected.length ? available.filter((t) => selected.includes(t)) : available),
    [available, selected],
  );

  const savedPoints = useMemo(
    () =>
      new Map(
        shown.map((t) => [
          t,
          isIntraday || !live
            ? EMPTY
            : rangeCloses(
                asHistory(live.series[t]),
                activeRange.value as HistoryRange,
                base,
                live.asOf,
              ),
        ]),
      ),
    [shown, live, activeRange, isIntraday, base],
  );

  const quotes = useMemo(
    () =>
      list
        ? listQuotes(
            shown,
            live,
            week.data?.range === "1w" ? week.data : undefined,
            history.data?.range === "history" ? history.data : undefined,
            base,
          )
        : new Map(),
    [list, shown, live, week.data, history.data, base],
  );
  const held = useHeld(items, list);

  const groups = useMemo(() => {
    if (!grouped) return [{ id: "all", label: "All", tickers: shown }];
    const out: { id: string; label: string; tickers: string[] }[] = [];
    for (const theme of themes) {
      const tickers = shown.filter((t) => itemByTicker.get(t)?.themes.includes(theme.id));
      if (tickers.length) out.push({ id: theme.id, label: theme.label, tickers });
    }
    // A ticker in no theme would otherwise vanish silently.
    const placed = new Set(out.flatMap((g) => g.tickers));
    const rest = shown.filter((t) => !placed.has(t));
    if (rest.length) out.push({ id: "untagged", label: "Untagged", tickers: rest });
    return out;
  }, [grouped, shown, themes, itemByTicker]);

  const allShut = groups.length > 0 && groups.every((g) => collapsedThemes.includes(g.id));
  const mobile = useMediaQuery("(max-width: 48em)");

  const rangeControl = (
    <SegmentedControl
      size="xs"
      fullWidth={mobile}
      value={activeRange.value}
      onChange={setRange}
      data={RANGES.map((r) => ({ value: r.value, label: r.label }))}
    />
  );
  const baseControl = (
    <SegmentedControl
      size="xs"
      fullWidth
      value={base}
      onChange={(value) => setBase(value as Display)}
      data={[
        { value: "EUR", label: "EUR" },
        { value: "USD", label: "USD" },
        { value: "native", label: "Native" },
      ]}
    />
  );
  const viewControl = (
    <SegmentedControl
      size="xs"
      fullWidth={mobile}
      value={view}
      onChange={(value) => setView(value as typeof view)}
      data={[
        { value: "compact", label: "Overview" },
        { value: "detailed", label: "Detailed" },
        { value: "list", label: "List" },
      ]}
    />
  );
  const search = (
    <MultiSelect
      w="100%"
      size="xs"
      searchable
      clearable
      placeholder={selected.length ? "" : "All tickers — search to narrow"}
      data={items.map((i) => ({ value: i.ticker, label: `${i.ticker} — ${i.name}` }))}
      value={selected}
      onChange={setSelected}
      maxDropdownHeight={280}
    />
  );
  // Set-and-forget display choices; the toolbar keeps only what changes per glance.
  const settings = (
    <Popover position="bottom-start" shadow="md" width={260} withArrow>
      <Popover.Target>
        <ActionIcon variant="default" size="input-xs" aria-label="Chart settings" title="Settings">
          <IconAdjustmentsHorizontal size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="md">
          <Setting label="Currency">{baseControl}</Setting>
          {!list && (
            <Setting label="Time gaps">
              <SegmentedControl
                size="xs"
                fullWidth
                value={gaps}
                onChange={(value) => setGaps(value as Gaps)}
                data={[
                  { value: "real", label: "Realistic" },
                  { value: "short", label: "Short" },
                ]}
              />
            </Setting>
          )}
          <Divider />
          <Switch
            size="sm"
            label="Group by theme"
            checked={grouped}
            onChange={(e) => setGrouped(e.currentTarget.checked)}
          />
          {isIntraday && (
            <Switch
              size="sm"
              label="Live price updates"
              checked={liveUpdates}
              onChange={(event) => setLiveUpdates(event.currentTarget.checked)}
            />
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
  const collapseAll = grouped ? (
    <Button
      size="xs"
      variant="default"
      onClick={() => setCollapsedThemes(allShut ? [] : groups.map((g) => g.id))}
    >
      {allShut ? "Expand all" : "Collapse all"}
    </Button>
  ) : null;
  const refreshRing = isIntraday ? (
    <RefreshRing
      cycle={cycle}
      live={liveUpdates}
      failed={status === "failed" || failedTickers.length > 0}
      onRefresh={refresh}
      updating={updating}
    />
  ) : null;
  const statusText = (
    <Text size="xs" c="dimmed" ta="center" truncate>
      {shown.length} shown ·{" "}
      {live ? `prices as of ${displayDateTime(live.asOf)}` : "loading prices"} · times in{" "}
      {LOCAL_TIME_ZONE}
      {status === "failed" && (
        <Text span c={TONE.warning}>
          {" "}
          · refresh failed, showing last data
        </Text>
      )}
      {failedTickers.length > 0 && (
        <Text span c={TONE.warning}>
          {" "}
          · no feed for {failedTickers.join(", ")}
        </Text>
      )}
    </Text>
  );
  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  if (!CONFIGURED) {
    return (
      <Alert color="yellow" title="Charts backend not configured">
        Set <Code>VITE_SUPABASE_URL</Code> and <Code>VITE_SUPABASE_KEY</Code> in <Code>.env</Code>{" "}
        (see <Code>.env.example</Code>) and restart the dev server.
      </Alert>
    );
  }
  return (
    <Stack gap="md">
      {header && <VantageBar />}
      {mobile ? (
        <Stack gap="xs">
          {!list && rangeControl}
          <Group gap="xs" wrap="nowrap">
            <Box style={{ flex: 1 }}>{viewControl}</Box>
            {settings}
          </Group>
          {search}
          {(collapseAll || refreshRing) && (
            <Group justify="space-between" gap="xs">
              {collapseAll ?? <span />}
              {refreshRing}
            </Group>
          )}
          <Box ta="center">{statusText}</Box>
        </Stack>
      ) : (
        <Stack gap={6}>
          <Box style={TOOLBAR_ROW}>
            <Group gap="xs" wrap="nowrap">
              {viewControl}
              {settings}
            </Group>
            <Box w={MIDDLE_WIDTH} maw="100%" style={{ justifySelf: "center" }}>
              {search}
            </Box>
            <Box style={{ justifySelf: "end" }}>{!list && rangeControl}</Box>
          </Box>
          <Box style={TOOLBAR_ROW}>
            <Box>{collapseAll}</Box>
            <Box w={MIDDLE_WIDTH} maw="100%" style={{ justifySelf: "center" }}>
              {statusText}
            </Box>
            <Box pr={4} style={{ justifySelf: "end" }}>
              {refreshRing}
            </Box>
          </Box>
        </Stack>
      )}

      {!live && status === "failed" && (
        <Alert color="red" title="Prices unavailable">
          The charts service did not respond. Click the refresh ring to retry.
        </Alert>
      )}
      {!live && status !== "failed" && (
        <Group gap="sm" py="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading prices…
          </Text>
        </Group>
      )}

      {live &&
        groups.map((g) => {
          const shut = collapsedThemes.includes(g.id);
          return (
            <Paper key={g.id} withBorder radius="md" p="sm">
              {/* The whole heading toggles the group; the chevron shows it can. */}
              <Group
                gap="sm"
                wrap="nowrap"
                mb={shut ? 0 : "sm"}
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => toggle(collapsedThemes, setCollapsedThemes, g.id)}
              >
                <ActionIcon
                  variant="default"
                  size="md"
                  aria-label={shut ? `Expand ${g.label}` : `Collapse ${g.label}`}
                >
                  {shut ? <IconChevronRight size={18} /> : <IconChevronDown size={18} />}
                </ActionIcon>
                <Text fw={700} fz="md">
                  {g.label}
                </Text>
                <Badge variant="default" size="md">
                  {g.tickers.length}
                </Badge>
              </Group>
              <Collapse expanded={!shut}>
                {list ? (
                  <WatchTable
                    tickers={g.tickers}
                    itemByTicker={itemByTicker}
                    quotes={quotes}
                    held={held}
                  />
                ) : (
                  <SimpleGrid
                    cols={compact ? { base: 1, sm: 2, md: 3, lg: 4, xl: 5 } : 1}
                    spacing="xs"
                    verticalSpacing="xs"
                  >
                    {g.tickers.map((t) => (
                      <TickerChart
                        key={t}
                        ticker={t}
                        item={itemByTicker.get(t)}
                        session={isIntraday ? asSession(live.series[t]) : undefined}
                        asOf={live.asOf}
                        compact={compact}
                        range={activeRange.value}
                        saved={savedPoints.get(t) ?? EMPTY}
                        base={base}
                        gaps={gaps}
                      />
                    ))}
                  </SimpleGrid>
                )}
              </Collapse>
            </Paper>
          );
        })}

      {live && !shown.length && (
        <Text size="sm" c="dimmed">
          Nothing selected.
        </Text>
      )}
    </Stack>
  );
}
