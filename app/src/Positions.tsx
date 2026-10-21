import {
  ActionIcon,
  Box,
  Button,
  Group,
  LoadingOverlay,
  Popover,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";
import type { BaseCurrency, ChartItem, ChartsResponse, ChartTheme } from "@shared/api.ts";
import { RANGES } from "./Charts.tsx";
import { GroupSection } from "./components/GroupSection.tsx";
import { useChartData } from "./lib/api.ts";
import { resolver, type FillRow, type Snapshot } from "./lib/broker.ts";
import { displayDate, displayDateTime, pct, signedPct } from "./lib/format.ts";
import {
  buildPositions,
  totalsOf,
  type Display,
  type Period,
  type PositionLine,
  type PositionTotals,
} from "./lib/positions.ts";
import { usePrivateMoney } from "./lib/privacy.tsx";
import { useSession } from "./lib/supabase.ts";
import { useLocalState } from "./lib/useLocalState.ts";
import { groupColors, TONE } from "./theme.ts";

const tone = (n: number | null) =>
  n == null || n === 0 ? undefined : n > 0 ? TONE.positive : TONE.negative;
const isPeriod = (v: string): v is Period => RANGES.some((r) => r.value === v);
const apiRange = (period: Period) =>
  period === "1d" ? null : period === "24h" || period === "1w" ? period : "history";

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

function PositionsTable({
  lines,
  totals,
  totalCurrency,
  weights,
  periodLabel,
  compact,
  loading,
}: {
  lines: PositionLine[];
  totals: PositionTotals;
  totalCurrency: string;
  weights: Map<string, number | null>;
  periodLabel: string;
  compact: boolean;
  loading: boolean;
}) {
  const money = usePrivateMoney();
  const amount = (n: number | null, currency: string) => (n == null ? "—" : money(n, currency));
  const signed = (n: number | null, currency: string) =>
    n == null ? "—" : `${n > 0 ? "+" : ""}${money(n, currency)}`;
  const percent = (n: number | null) => (n == null ? "—" : signedPct(n));
  const pending = (n: number | null) => (loading && n == null ? "…" : null);
  return (
    <Table
      striped
      withTableBorder
      layout={compact ? "auto" : "fixed"}
      fz={compact ? "xs" : "sm"}
      horizontalSpacing={compact ? 6 : "xs"}
      verticalSpacing={compact ? 6 : 4}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={compact ? undefined : 300}>Ticker</Table.Th>
          <Table.Th ta="right" w={compact ? undefined : 130}>
            Value
          </Table.Th>
          {!compact && (
            <Table.Th ta="right" w={80}>
              Weight
            </Table.Th>
          )}
          <Table.Th ta="right" w={compact ? undefined : 130}>
            {compact ? "Unrl." : "Unrealized"}
          </Table.Th>
          {!compact && (
            <Table.Th ta="right" w={90}>
              Unrl. %
            </Table.Th>
          )}
          <Table.Th ta="right" w={compact ? undefined : 90}>
            {periodLabel} %
          </Table.Th>
          <Table.Th ta="right" w={compact ? undefined : 130}>
            {periodLabel} P&L
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {lines.map((l) => {
          const weight = weights.get(l.key);
          return (
            <Table.Tr key={l.key}>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Text fw={600} fz="inherit">
                    {l.ticker}
                  </Text>
                  {!l.live && (
                    <Tooltip label="No live price; at the statement's mark">
                      <Text fz="inherit" c="dimmed">
                        *
                      </Text>
                    </Tooltip>
                  )}
                  {!compact && (
                    <Text size="xs" c="dimmed" truncate>
                      {l.name}
                    </Text>
                  )}
                </Group>
              </Table.Td>
              <Table.Td ta="right">{amount(l.value, l.currency)}</Table.Td>
              {!compact && <Table.Td ta="right">{weight == null ? "—" : pct(weight)}</Table.Td>}
              <Table.Td ta="right" c={tone(l.unrealized)}>
                {signed(l.unrealized, l.currency)}
              </Table.Td>
              {!compact && (
                <Table.Td ta="right" c={tone(l.unrealizedPct)}>
                  {percent(l.unrealizedPct)}
                </Table.Td>
              )}
              <Table.Td ta="right" c={tone(l.change)}>
                {pending(l.change) ?? percent(l.change)}
              </Table.Td>
              <Table.Td ta="right" c={tone(l.periodPnl)}>
                {pending(l.periodPnl) ?? signed(l.periodPnl, l.currency)}
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr fw={600}>
          <Table.Td>Total</Table.Td>
          <Table.Td ta="right">{money(totals.value, totalCurrency)}</Table.Td>
          {!compact && <Table.Td />}
          <Table.Td ta="right" c={tone(totals.unrealized)}>
            {signed(totals.unrealized, totalCurrency)}
          </Table.Td>
          {!compact && (
            <Table.Td ta="right" c={tone(totals.unrealizedPct)}>
              {percent(totals.unrealizedPct)}
            </Table.Td>
          )}
          <Table.Td ta="right" c={tone(totals.change)}>
            {pending(totals.change) ?? percent(totals.change)}
          </Table.Td>
          <Table.Td ta="right" c={tone(totals.periodPnl)}>
            {pending(totals.periodPnl) ?? signed(totals.periodPnl, totalCurrency)}
          </Table.Td>
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  );
}

export function PositionsPage({
  snapshot,
  fills,
  day,
  base,
  cycle,
  stale,
}: {
  snapshot: Snapshot;
  fills: FillRow[];
  day: ChartsResponse;
  base: BaseCurrency;
  /** Refetches the 24H and 5D prices alongside the 1D ones. */
  cycle: number;
  stale: boolean;
}) {
  const session = useSession();
  const compact = useMediaQuery("(max-width: 48em)") ?? false;
  const [display, setDisplay] = useLocalState<Display>("positions:display", base);
  const [stored, setPeriod] = useLocalState<string>("positions:period", "1d");
  const [grouped, setGrouped] = useLocalState("positions:grouped", true);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const period: Period = isPeriod(stored) ? stored : "1d";
  const periodLabel = RANGES.find((r) => r.value === period)!.label;

  const range = apiRange(period);
  // History is cached upstream for hours; once per visit is enough.
  const [opened] = useState(() => Date.now());
  const periodData = useChartData(range, range === "history" ? opened : cycle, session);
  const current = range === null ? day : periodData.data;
  const loading = range !== null && current?.range !== range;

  const items: ChartItem[] = day.items;
  const themes: ChartTheme[] = day.themes;
  const resolve = useMemo(() => resolver(items), [items]);
  const names = useMemo(() => new Map(items.map((i) => [i.ticker, i.name])), [items]);
  const { lines, totalLines } = useMemo(() => {
    const build = (as: Display) =>
      buildPositions({
        snapshot,
        fills,
        day,
        periodData: current,
        period,
        display: as,
        base,
        resolve,
        names,
      });
    const shown = build(display);
    // Native amounts don't add up across currencies, so totals and weights stay in the account's.
    const totalLines = display === "native" ? build(base) : shown;
    const order = new Map(totalLines.map((l) => [l.key, l.value ?? 0]));
    shown.sort((a, b) => order.get(b.key)! - order.get(a.key)!);
    return { lines: shown, totalLines };
  }, [snapshot, fills, day, current, period, display, base, resolve, names]);
  const totalCurrency = display === "native" ? base : display;
  const grandTotal = totalsOf(totalLines).value;
  const weights = new Map(
    totalLines.map((l) => [l.key, l.value == null || !grandTotal ? null : l.value / grandTotal]),
  );
  const totalOf = (keys: Set<string>) => totalsOf(totalLines.filter((l) => keys.has(l.key)));

  // Grouped as on the watchlist: a position shows in every group its ticker is in.
  const groups = useMemo(() => {
    if (!grouped) return [{ id: "all", label: "All", lines }];
    const themesOf = new Map(items.map((i) => [i.ticker, i.themes]));
    const out: { id: string; label: string; lines: PositionLine[] }[] = [];
    for (const theme of themes) {
      const inTheme = lines.filter((l) => themesOf.get(l.ticker)?.includes(theme.id));
      if (inTheme.length) out.push({ id: theme.id, label: theme.label, lines: inTheme });
    }
    const placed = new Set(out.flatMap((g) => g.lines.map((l) => l.key)));
    const rest = lines.filter((l) => !placed.has(l.key));
    if (rest.length) out.push({ id: "untagged", label: "Untagged", lines: rest });
    return out;
  }, [grouped, lines, items, themes]);
  const colorOf = useMemo(() => groupColors(themes), [themes]);
  const allShut = groups.length > 0 && groups.every((g) => collapsed.includes(g.id));
  const collapseAll = grouped ? (
    <Button
      size="xs"
      variant="default"
      onClick={() => setCollapsed(allShut ? [] : groups.map((g) => g.id))}
    >
      {allShut ? "Expand all" : "Collapse all"}
    </Button>
  ) : null;

  const periodControl = (
    <SegmentedControl
      size="xs"
      fullWidth={compact}
      value={period}
      onChange={setPeriod}
      data={RANGES.map((r) => ({ value: r.value, label: r.label }))}
    />
  );
  const settings = (
    <Popover position="bottom-end" shadow="md" width={240} withArrow>
      <Popover.Target>
        <ActionIcon
          variant="default"
          size="input-xs"
          aria-label="Positions settings"
          title="Settings"
        >
          <IconAdjustmentsHorizontal size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="md">
          <Setting label="Currency">
            <SegmentedControl
              size="xs"
              fullWidth
              value={display}
              onChange={(v) => setDisplay(v as Display)}
              data={[
                { value: "EUR", label: "EUR" },
                { value: "USD", label: "USD" },
                { value: "native", label: "Native" },
              ]}
            />
          </Setting>
          <Switch
            size="sm"
            label="Group by theme"
            checked={grouped}
            onChange={(e) => setGrouped(e.currentTarget.checked)}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
  const table = (shown: PositionLine[], totals: PositionTotals) => (
    <Box pos="relative">
      <LoadingOverlay
        visible={stale}
        zIndex={1}
        transitionProps={{ duration: 200 }}
        overlayProps={{ blur: 1, backgroundOpacity: 0.15 }}
        loaderProps={{ size: "sm" }}
      />
      <Table.ScrollContainer minWidth={compact ? 0 : 760}>
        <PositionsTable
          lines={shown}
          totals={totals}
          totalCurrency={totalCurrency}
          weights={weights}
          periodLabel={periodLabel}
          compact={compact}
          loading={loading}
        />
      </Table.ScrollContainer>
    </Box>
  );

  return (
    <Stack gap="sm">
      {compact ? (
        <>
          <Group gap="xs" wrap="nowrap">
            <Box style={{ flex: 1, minWidth: 0 }}>{periodControl}</Box>
            {settings}
          </Group>
          {collapseAll && <Box>{collapseAll}</Box>}
        </>
      ) : (
        <Group justify="space-between" gap="xs">
          {collapseAll ?? <span />}
          <Group gap="xs">
            {periodControl}
            {settings}
          </Group>
        </Group>
      )}
      {grouped
        ? groups.map((g) => {
            const sum = totalOf(new Set(g.lines.map((l) => l.key)));
            const open = !collapsed.includes(g.id);
            return (
              <GroupSection
                key={g.id}
                label={g.label}
                color={colorOf(g.id)}
                count={g.lines.length}
                open={open}
                onToggle={() =>
                  setCollapsed(open ? [...collapsed, g.id] : collapsed.filter((c) => c !== g.id))
                }
                summary={
                  sum.change != null && (
                    <Text size="sm" c={tone(sum.change)}>
                      {signedPct(sum.change)}
                    </Text>
                  )
                }
              >
                {table(g.lines, sum)}
              </GroupSection>
            );
          })
        : table(lines, totalsOf(totalLines))}
      <Text size="xs" c="dimmed" ta="center">
        Positions from the {displayDate(snapshot.as_of)} statement · prices as of{" "}
        {displayDateTime(day.asOf)}
        {display === "native" ? ` · totals in ${base}` : ""}
      </Text>
    </Stack>
  );
}
