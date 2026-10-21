import { DonutChart } from "@mantine/charts";
import {
  Alert,
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  useMantineTheme,
} from "@mantine/core";
import type { BaseCurrency, ChartsResponse, ChartTheme } from "@shared/api.ts";
import { Stat } from "./components/Stat.tsx";
import { NavHistory } from "./NavHistory.tsx";
import { PositionsPage } from "./Positions.tsx";
import { displayDate, displayDateTime, pct, signedPct } from "./lib/format.ts";
import { usePrivateMoney } from "./lib/privacy.tsx";
import { useHashTab } from "./lib/useHashTab.ts";
import { useLocalState } from "./lib/useLocalState.ts";
import { groupColors, groupSolid, TONE } from "./theme.ts";
import type { Built, FillRow, NavRow, Snapshot } from "./lib/broker.ts";

const TABS = [
  { value: "account", label: "Account" },
  { value: "positions", label: "Positions" },
] as const;
type Tab = (typeof TABS)[number]["value"];
const TAB_KEYS = TABS.map((t) => t.value);

function AccountView({
  built,
  history,
  themes,
}: {
  built: Built;
  history: NavRow[];
  themes: ChartTheme[];
}) {
  const money = usePrivateMoney();
  const { portfolio, quoteAsOf } = built;
  const base = portfolio.baseCurrency;
  const total = portfolio.totals.value;

  const colorOf = groupColors(themes);
  const mantine = useMantineTheme();
  const donut = portfolio.totals.byTheme.map((t) => ({
    name: t.label,
    value: Math.round(t.value),
    color: groupSolid(mantine, colorOf(t.theme)),
  }));

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
              {portfolio.totals.byTheme.map((t) => (
                <Group key={t.theme} justify="space-between">
                  <Group gap={8}>
                    <Badge color={groupSolid(mantine, colorOf(t.theme))} size="xs">
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

      <Text size="sm" c="dimmed">
        {portfolio.watchOnly.length} watchlist{" "}
        {portfolio.watchOnly.length === 1 ? "name is" : "names are"} tracked but not held.
      </Text>
    </Stack>
  );
}

export function PortfolioPage({
  built,
  history,
  snapshot,
  fills,
  day,
  base,
  cycle,
  stale,
}: {
  built: Built;
  history: NavRow[];
  snapshot: Snapshot;
  fills: FillRow[];
  day: ChartsResponse;
  base: BaseCurrency;
  cycle: number;
  stale: boolean;
}) {
  // A bare #/portfolio reopens the last tab, so the phone lands on the overview it was left on.
  const [last, setLast] = useLocalState<Tab>("portfolio:tab", "account");
  const [tab, go] = useHashTab("portfolio", TAB_KEYS, TAB_KEYS.includes(last) ? last : "account");
  return (
    <Tabs
      value={tab}
      onChange={(v) => {
        const next = TABS.find((t) => t.value === v)?.value;
        if (!next) return;
        setLast(next);
        go(next);
      }}
      variant="pills"
      radius="xl"
    >
      <Tabs.List justify="center" mb="lg">
        {TABS.map((t) => (
          <Tabs.Tab key={t.value} value={t.value} fz="md" fw={600} px="lg">
            {t.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel value="account">
        <AccountView built={built} history={history} themes={day.themes} />
      </Tabs.Panel>
      <Tabs.Panel value="positions">
        {tab === "positions" && (
          <PositionsPage
            snapshot={snapshot}
            fills={fills}
            day={day}
            base={base}
            cycle={cycle}
            stale={stale}
          />
        )}
      </Tabs.Panel>
    </Tabs>
  );
}
