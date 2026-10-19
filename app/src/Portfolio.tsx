import { DonutChart } from "@mantine/charts";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import type { ChartItem, ChartTheme } from "@shared/api.ts";
import { Stat } from "./components/Stat.tsx";
import { NavHistory } from "./NavHistory.tsx";
import { displayDate, displayDateTime, pct, signedPct } from "./lib/format.ts";
import { usePrivateMoney } from "./lib/privacy.tsx";
import { TONE } from "./theme.ts";
import type { Position } from "./lib/types.ts";
import type { Built, NavRow } from "./lib/broker.ts";

const UNCLASSIFIED = "unclassified";
const THEME_COLORS = [
  "indigo.6",
  "teal.6",
  "grape.6",
  "orange.6",
  "cyan.6",
  "lime.6",
  "pink.6",
  "gray.6",
];

function changeTone(changePct: number | null) {
  if (changePct === null) return undefined;
  return changePct > 0 ? TONE.positive : changePct < 0 ? TONE.negative : undefined;
}

const COL = { ticker: 300, value: 130, weight: 80, day: 80, pnl: 130, pnlPct: 90, source: 90 };

function groupTotals(positions: Position[], changes: Record<string, number | null>) {
  let value = 0;
  let cost = 0;
  let pnl = 0;
  let dayWeighted = 0;
  let dayValue = 0;
  for (const p of positions) {
    if (p.valueBase === null || p.valueBase === undefined) continue;
    value += p.valueBase;
    const c = p.costBasisBase ?? null;
    if (c !== null) {
      cost += c;
      pnl += p.valueBase - c;
    }
    const change = changes[p.ticker] ?? null;
    if (change !== null) {
      dayWeighted += p.valueBase * change;
      dayValue += p.valueBase;
    }
  }
  return {
    value,
    day: dayValue ? dayWeighted / dayValue : null,
    pnl: cost ? pnl : null,
    pnlPct: cost ? value / cost - 1 : null,
  };
}

function HoldingsTable({
  positions,
  total,
  collapsed,
  base,
  changes,
  names,
  compact,
}: {
  positions: Position[];
  total: number;
  collapsed: boolean;
  base: string;
  changes: Record<string, number | null>;
  names: Map<string, string>;
  compact: boolean;
}) {
  const money = usePrivateMoney();
  const sum = groupTotals(positions, changes);
  const w = (n: number) => (compact ? undefined : n);
  return (
    <Table
      striped
      withTableBorder
      layout={compact ? "auto" : "fixed"}
      fz={compact ? "xs" : undefined}
      horizontalSpacing={compact ? 6 : "xs"}
      verticalSpacing={compact ? 4 : undefined}
      style={compact ? undefined : { minWidth: 820 }}
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={w(COL.ticker)}>Ticker</Table.Th>
          <Table.Th ta="right" w={w(COL.value)}>
            Value
          </Table.Th>
          <Table.Th ta="right" w={w(COL.weight)}>
            Weight
          </Table.Th>
          <Table.Th ta="right" w={w(COL.day)}>
            Day
          </Table.Th>
          <Table.Th ta="right" w={w(COL.pnl)}>
            P&L
          </Table.Th>
          <Table.Th ta="right" w={w(COL.pnlPct)}>
            P&L %
          </Table.Th>
          {!compact && <Table.Th w={COL.source}>Priced</Table.Th>}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {collapsed
          ? null
          : positions.map((p) => {
              const change = changes[p.ticker] ?? null;
              const cost = p.costBasisBase ?? null;
              const pnl = cost === null || p.valueBase === null ? null : p.valueBase - cost;
              const pnlPct = cost ? (p.valueBase ?? 0) / cost - 1 : null;
              return (
                <Table.Tr key={`${p.source}:${p.ticker}`}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={600} fz={compact ? "xs" : undefined}>
                        {p.ticker}
                      </Text>
                      {!compact && (
                        <Text size="xs" c="dimmed" truncate>
                          {names.get(p.ticker) ?? p.name}
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">
                    {p.valueBase === null ? "—" : money(p.valueBase, base)}
                  </Table.Td>
                  <Table.Td ta="right">
                    {p.valueBase === null || total === 0 ? "—" : pct(p.valueBase / total)}
                  </Table.Td>
                  <Table.Td ta="right" c={changeTone(change)}>
                    {change != null ? signedPct(change) : "—"}
                  </Table.Td>
                  <Table.Td ta="right" c={changeTone(pnl)}>
                    {pnl === null ? "—" : money(pnl, base)}
                  </Table.Td>
                  <Table.Td ta="right" c={changeTone(pnlPct)}>
                    {pnlPct === null ? "—" : signedPct(pnlPct)}
                  </Table.Td>
                  {!compact && (
                    <Table.Td>
                      <Badge
                        size="xs"
                        variant="light"
                        color={p.priceSource === "quote" ? TONE.info : TONE.neutral}
                      >
                        {p.priceSource === "quote" ? "live" : "broker"}
                      </Badge>
                    </Table.Td>
                  )}
                </Table.Tr>
              );
            })}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr fw={600}>
          <Table.Td>Total</Table.Td>
          <Table.Td ta="right">{money(sum.value, base)}</Table.Td>
          <Table.Td ta="right">{total === 0 ? "—" : pct(sum.value / total)}</Table.Td>
          <Table.Td ta="right" c={changeTone(sum.day)}>
            {sum.day === null ? "—" : signedPct(sum.day)}
          </Table.Td>
          <Table.Td ta="right" c={changeTone(sum.pnl)}>
            {sum.pnl === null ? "—" : money(sum.pnl, base)}
          </Table.Td>
          <Table.Td ta="right" c={changeTone(sum.pnlPct)}>
            {sum.pnlPct === null ? "—" : signedPct(sum.pnlPct)}
          </Table.Td>
          {!compact && (
            <Table.Td>
              <Text size="xs" c="dimmed">
                {positions.length} {positions.length === 1 ? "position" : "positions"}
              </Text>
            </Table.Td>
          )}
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  );
}

export function PortfolioPage({
  built,
  history,
  items,
  themes,
}: {
  built: Built;
  history: NavRow[];
  items: ChartItem[];
  themes: ChartTheme[];
}) {
  const money = usePrivateMoney();
  const compact = useMediaQuery("(max-width: 48em)") ?? false;
  const { portfolio, changes, quoteAsOf } = built;
  const base = portfolio.baseCurrency;
  const total = portfolio.totals.value;
  const names = new Map(items.map((i) => [i.ticker, i.name]));
  const themeOf = new Map(items.map((i) => [i.ticker, i.themes]));

  const groups = new Map<string, Position[]>();
  for (const p of portfolio.positions) {
    const primary = themeOf.get(p.ticker)?.[0] ?? UNCLASSIFIED;
    groups.set(primary, [...(groups.get(primary) ?? []), p]);
  }
  const donut = portfolio.totals.byTheme.map((t, i) => ({
    name: t.label,
    value: Math.round(t.value),
    color: THEME_COLORS[i % THEME_COLORS.length],
  }));

  const [collapsed, setCollapsed] = useState<string[]>([]);
  const toggle = (id: string) =>
    setCollapsed(collapsed.includes(id) ? collapsed.filter((t) => t !== id) : [...collapsed, id]);
  const allFolded = [...groups.keys()].every((t) => collapsed.includes(t));

  const cash = portfolio.cash;
  const grossLeverage = portfolio.totals.netValue ? total / portfolio.totals.netValue : 0;
  const { costBasis, costBasisCoverage } = portfolio.totals;
  const pnl = costBasis ? costBasisCoverage - costBasis : null;
  const pnlPct = costBasis ? costBasisCoverage / costBasis - 1 : null;
  const pnlCoverage = total ? costBasisCoverage / total : 0;

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        Positions from the {displayDate(portfolio.asOf)} statement
        {quoteAsOf ? ` · live prices as of ${displayDateTime(quoteAsOf)}` : " · broker marks"}
        {portfolio.brokerNav ? ` · broker NAV ${money(portfolio.brokerNav.value, base)}` : ""}
      </Text>

      {portfolio.warnings.length ? (
        <Alert color={TONE.warning} title="Notes">
          {portfolio.warnings.map((w) => (
            <Text size="sm" key={w}>
              {w}
            </Text>
          ))}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat
          value={money(portfolio.totals.netValue, base)}
          label="Net value"
          hint={`positions + cash · ${grossLeverage.toFixed(2)}× gross leverage`}
        />
        <Stat value={money(total, base)} label="Positions" />
        <Stat
          value={cash ? money(cash.value, base) : "—"}
          label={cash && cash.value < 0 ? "Cash (margin loan)" : "Cash"}
          tone={cash && cash.value < 0 ? "warning" : undefined}
          hint={cash ? `IBKR ${displayDate(cash.asOf)}` : "no source"}
        />
        <Stat
          value={pnl === null ? "—" : money(pnl, base)}
          label="Total P&L"
          tone={pnl === null ? undefined : pnl > 0 ? "positive" : pnl < 0 ? "negative" : undefined}
          hint={
            pnlPct === null
              ? "no cost basis"
              : `${signedPct(pnlPct)}${pnlCoverage < 0.995 ? ` · covers ${pct(pnlCoverage, 0)} of the book` : ""}`
          }
        />
      </SimpleGrid>

      <NavHistory history={history} base={base} />

      {donut.length ? (
        <Card withBorder>
          <Group align="flex-start" justify="space-between" wrap="wrap">
            <DonutChart data={donut} size={180} thickness={26} withTooltip />
            <Stack gap={4} style={{ flex: 1, minWidth: 260 }}>
              {portfolio.totals.byTheme.map((t, i) => (
                <Group key={t.theme} justify="space-between">
                  <Group gap={8}>
                    <Badge color={THEME_COLORS[i % THEME_COLORS.length].split(".")[0]} size="xs">
                      {" "}
                    </Badge>
                    <Text size="sm">{t.label}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {money(t.value, base)} · {pct(t.share)}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Group>
        </Card>
      ) : null}

      <Group justify="space-between" align="baseline">
        <Title order={3}>Holdings</Title>
        <Button
          variant="default"
          size="xs"
          onClick={() => setCollapsed(allFolded ? [] : [...groups.keys()])}
        >
          {allFolded ? "Expand all" : "Collapse all"}
        </Button>
      </Group>

      {[...groups.entries()].map(([themeId, positions]) => {
        const label = themes.find((t) => t.id === themeId)?.label ?? "Unclassified";
        const folded = collapsed.includes(themeId);
        return (
          <Stack key={themeId} gap={4}>
            <Group
              gap="sm"
              wrap="nowrap"
              style={{ cursor: "pointer", userSelect: "none" }}
              onClick={() => toggle(themeId)}
            >
              <ActionIcon
                variant="default"
                size="md"
                aria-label={folded ? `Expand ${label}` : `Collapse ${label}`}
              >
                {folded ? <IconChevronRight size={18} /> : <IconChevronDown size={18} />}
              </ActionIcon>
              <Text fw={700} fz="md">
                {label}
              </Text>
            </Group>
            <Table.ScrollContainer minWidth={compact ? 320 : 820}>
              <HoldingsTable
                positions={positions}
                total={total}
                collapsed={folded}
                base={base}
                changes={changes}
                names={names}
                compact={compact}
              />
            </Table.ScrollContainer>
          </Stack>
        );
      })}

      <Text size="sm" c="dimmed">
        {portfolio.watchOnly.length} watchlist{" "}
        {portfolio.watchOnly.length === 1 ? "name is" : "names are"} tracked but not held.
      </Text>
    </Stack>
  );
}
