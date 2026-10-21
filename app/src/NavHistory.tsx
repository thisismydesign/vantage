import { AreaChart } from "@mantine/charts";
import { Card, Group, Paper, SegmentedControl, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useMemo } from "react";
import { dateTicks, niceTicks, stepDecimals } from "./lib/axis.ts";
import type { NavRow } from "./lib/broker.ts";
import { displayDate, money as fullMoney, signedPct } from "./lib/format.ts";
import { gain, netFlows, timeWeighted } from "./lib/performance.ts";
import { cutoff, PERIODS } from "./lib/periods.ts";
import { usePrivacy, usePrivateMoney } from "./lib/privacy.tsx";
import { useLocalState } from "./lib/useLocalState.ts";
import { TONE } from "./theme.ts";

type Row = {
  x: number;
  nav: number;
  cash: number | null;
  flow: number | null;
  /** Time-weighted since the period's first day. */
  ret: number | null;
  day: string;
};

const MODES = [
  { value: "value", label: "Value" },
  { value: "performance", label: "Performance" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortMoney(n: number, currency: string) {
  const abs = Math.abs(n);
  const [scale, suffix] = abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "k"] : [1, ""];
  const digits = abs / scale < 10 && scale > 1 ? 1 : 0;
  return fullMoney(0, currency).replace(
    /0$/,
    `${n < 0 ? "-" : ""}${(abs / scale).toFixed(digits)}${suffix}`,
  );
}

export function NavHistory({ history, base }: { history: NavRow[]; base: string }) {
  const compact = useMediaQuery("(max-width: 48em)") ?? false;
  const money = usePrivateMoney();
  const { hidden } = usePrivacy();
  const [period, setPeriod] = useLocalState("portfolio:history:period", "1y");
  const [mode, setMode] = useLocalState("portfolio:history:mode", "value");
  const performance = mode === "performance";
  const since = cutoff(period);

  const inPeriod = useMemo(
    () => history.filter((r) => !since || r.as_of >= since),
    [history, since],
  );
  const rows = useMemo<Row[]>(() => {
    const returns = timeWeighted(inPeriod);
    return inPeriod.map((r, i) => ({
      x: Date.parse(`${r.as_of}T00:00:00Z`),
      nav: r.nav,
      cash: r.cash,
      flow: r.flow,
      ret: returns?.[i] ?? null,
      day: r.as_of,
    }));
  }, [inPeriod]);
  const first = rows[0];
  const last = rows.at(-1);
  const twr = last?.ret ?? null;
  const made = gain(inPeriod);
  const moved = netFlows(inPeriod);
  // Without flows, the change in value is all that's known; it may include deposits.
  const change = made ?? (first && last ? last.nav - first.nav : null);
  const trend = performance ? twr : change;
  const colour = TONE[trend == null ? "neutral" : trend >= 0 ? "positive" : "negative"];
  const signedMoney = (n: number) => `${n >= 0 ? "+" : ""}${money(n, base)}`;
  const arrow = (n: number) => (n >= 0 ? "▲" : "▼");

  const axes = useMemo(() => {
    if (rows.length < 2) return null;
    const values = rows.map((r) => (performance ? r.ret : r.nav));
    if (values.some((v) => v == null)) return null;
    const ys = values as number[];
    const yTicks = niceTicks(Math.min(...ys), Math.max(...ys), compact ? 3 : 4);
    const pctDigits = Math.max(0, ...yTicks.map((t) => stepDecimals(t) - 2));
    const dates = dateTicks(rows[0].x, rows.at(-1)!.x, compact ? 4 : 6);
    const xLabel = (t: number) => {
      const d = new Date(t);
      if (dates.unit === "year" || (dates.unit === "month" && d.getUTCMonth() === 0))
        return String(d.getUTCFullYear());
      if (dates.unit === "month") return MONTHS[d.getUTCMonth()];
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    };
    return { yTicks, pctDigits, xTicks: dates.ticks, xLabel };
  }, [rows, compact, performance]);

  return (
    <Card withBorder>
      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
        <Group gap="sm">
          <Text fw={600}>Account</Text>
          <SegmentedControl size="xs" data={MODES} value={mode} onChange={setMode} />
        </Group>
        <SegmentedControl size="xs" data={PERIODS} value={period} onChange={setPeriod} />
      </Group>
      {first && last && (
        <Group gap="md" align="baseline" mt="sm">
          <Text
            fz={24}
            fw={500}
            c={performance ? colour : undefined}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {performance ? (twr == null ? "—" : signedPct(twr, 2)) : money(last.nav, base)}
          </Text>
          {change != null && (
            <Text c={colour} fw={500}>
              {arrow(change)} {signedMoney(change)}{" "}
              <Text span c="dimmed" size="sm">
                {made == null ? "" : "gain "}since {displayDate(first.day)}
                {made == null
                  ? " · deposits not reported"
                  : moved
                    ? ` · ${signedMoney(moved)} ${moved > 0 ? "deposited" : "withdrawn"}`
                    : ""}
              </Text>
            </Text>
          )}
        </Group>
      )}
      {!axes ? (
        <Text size="sm" c="dimmed" py="xl">
          {!history.length
            ? "Your agent sends the broker's daily NAV through the API; the history shows here."
            : performance && rows.length > 1 && twr == null
              ? "Performance needs the deposits and withdrawals of every day; your agent hasn't sent them for this period."
              : "Not enough statements in this period."}
        </Text>
      ) : (
        <AreaChart
          h={compact ? 180 : 240}
          mt="sm"
          data={rows}
          dataKey="x"
          series={[
            performance
              ? { name: "ret", color: colour, label: "Performance" }
              : { name: "nav", color: colour, label: "Account value" },
          ]}
          referenceLines={performance ? [{ y: 0, color: TONE.neutral }] : undefined}
          curveType="linear"
          withDots={false}
          strokeWidth={2}
          withLegend={false}
          withGradient
          fillOpacity={0.15}
          gridAxis="x"
          strokeDasharray="0"
          tickLine="none"
          activeDotProps={{ r: 4, strokeWidth: 2 }}
          yAxisProps={{
            domain: [axes.yTicks[0], axes.yTicks.at(-1)!],
            ticks: axes.yTicks,
            interval: 0,
            orientation: "right",
            width: compact ? 44 : 56,
            tick: { fontSize: compact ? 10 : 12, fill: "var(--mantine-color-dimmed)" },
            tickFormatter: (v: number) =>
              performance ? signedPct(v, axes.pctDigits) : hidden ? "" : shortMoney(v, base),
          }}
          xAxisProps={{
            type: "number",
            domain: [rows[0].x, rows.at(-1)!.x],
            ticks: axes.xTicks,
            interval: 0,
            tick: { fontSize: compact ? 10 : 12, fill: "var(--mantine-color-dimmed)" },
            tickFormatter: axes.xLabel,
          }}
          tooltipProps={{
            cursor: { stroke: "var(--mantine-color-dimmed)", strokeWidth: 1 },
            content: ({ payload }) => {
              const row = (payload?.[0]?.payload ?? null) as Row | null;
              if (!row) return null;
              return (
                <Paper withBorder shadow="sm" px="sm" py={6}>
                  <Text size="sm" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {performance ? signedPct(row.ret!, 2) : money(row.nav, base)}{" "}
                    <Text span size="xs" fw={500} c="dimmed">
                      {performance ? money(row.nav, base) : row.ret != null && signedPct(row.ret)}
                    </Text>
                  </Text>
                  <Text size="xs" c="dimmed">
                    {displayDate(row.day)}
                    {!performance && row.cash != null ? ` · cash ${money(row.cash, base)}` : ""}
                    {row.flow
                      ? ` · ${money(Math.abs(row.flow), base)} ${row.flow > 0 ? "deposited" : "withdrawn"}`
                      : ""}
                  </Text>
                </Paper>
              );
            },
          }}
        />
      )}
    </Card>
  );
}
