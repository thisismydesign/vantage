import { AreaChart } from "@mantine/charts";
import { Card, Group, Paper, SegmentedControl, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useMemo } from "react";
import { dateTicks, niceTicks } from "./lib/axis.ts";
import type { NavRow } from "./lib/broker.ts";
import { displayDate, money as fullMoney, signedPct } from "./lib/format.ts";
import { cutoff, PERIODS } from "./lib/periods.ts";
import { usePrivacy, usePrivateMoney } from "./lib/privacy.tsx";
import { useLocalState } from "./lib/useLocalState.ts";
import { TONE } from "./theme.ts";

type Row = { x: number; nav: number; cash: number | null; day: string };

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
  const since = cutoff(period);

  const rows = useMemo<Row[]>(
    () =>
      history
        .filter((r) => !since || r.as_of >= since)
        .map((r) => ({
          x: Date.parse(`${r.as_of}T00:00:00Z`),
          nav: r.nav,
          cash: r.cash,
          day: r.as_of,
        })),
    [history, since],
  );
  const first = rows[0];
  const last = rows.at(-1);
  const change = first && last && first.nav ? last.nav / first.nav - 1 : null;
  const colour = TONE[change == null ? "neutral" : change >= 0 ? "positive" : "negative"];

  const axes = useMemo(() => {
    if (rows.length < 2) return null;
    const navs = rows.map((r) => r.nav);
    const yTicks = niceTicks(Math.min(...navs), Math.max(...navs), compact ? 3 : 4);
    const dates = dateTicks(rows[0].x, rows.at(-1)!.x, compact ? 4 : 6);
    const xLabel = (t: number) => {
      const d = new Date(t);
      if (dates.unit === "year" || (dates.unit === "month" && d.getUTCMonth() === 0))
        return String(d.getUTCFullYear());
      if (dates.unit === "month") return MONTHS[d.getUTCMonth()];
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    };
    return { yTicks, xTicks: dates.ticks, xLabel };
  }, [rows, compact]);

  return (
    <Card withBorder>
      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
        <Text fw={600}>Account value</Text>
        <SegmentedControl size="xs" data={PERIODS} value={period} onChange={setPeriod} />
      </Group>
      {first && last && (
        <Group gap="md" align="baseline" mt="sm">
          <Text fz={24} fw={500} style={{ fontVariantNumeric: "tabular-nums" }}>
            {money(last.nav, base)}
          </Text>
          <Text c={colour} fw={500}>
            {change == null
              ? "—"
              : `${change >= 0 ? "▲" : "▼"} ${signedPct(change)} (${last.nav >= first.nav ? "+" : ""}${money(last.nav - first.nav, base)})`}{" "}
            <Text span c="dimmed" size="sm">
              since {displayDate(first.day)}
            </Text>
          </Text>
        </Group>
      )}
      {!axes ? (
        <Text size="sm" c="dimmed" py="xl">
          {history.length
            ? "Not enough statements in this period."
            : "Your agent sends the broker's daily NAV through the API; the history shows here."}
        </Text>
      ) : (
        <AreaChart
          h={compact ? 180 : 240}
          mt="sm"
          data={rows}
          dataKey="x"
          series={[{ name: "nav", color: colour, label: "Account value" }]}
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
            tickFormatter: (v: number) => (hidden ? "" : shortMoney(v, base)),
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
              const move = first?.nav ? row.nav / first.nav - 1 : null;
              return (
                <Paper withBorder shadow="sm" px="sm" py={6}>
                  <Text size="sm" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {money(row.nav, base)}{" "}
                    {move != null && (
                      <Text span size="xs" fw={500} c="dimmed">
                        {signedPct(move)}
                      </Text>
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {displayDate(row.day)}
                    {row.cash != null ? ` · cash ${money(row.cash, base)}` : ""}
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
