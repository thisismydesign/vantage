import { AreaChart, BarChart } from "@mantine/charts";
import {
  Alert,
  Badge,
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useMemo } from "react";
import type { TradeClose, TradeName, TradesFile } from "./lib/types.ts";
import { Stat } from "./components/Stat.tsx";
import { displayDate, pct, signedPct } from "./lib/format.ts";
import { usePrivacy, usePrivateMoney } from "./lib/privacy.tsx";
import { useLocalState } from "./lib/useLocalState.ts";
import { TONE } from "./theme.ts";
import type { Pricing } from "./lib/broker.ts";
import { cutoff, PERIODS } from "./lib/periods.ts";

const LENSES = [
  { value: "names", label: "Names" },
  { value: "closes", label: "Closes" },
];

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const tone = (n: number | null | undefined) =>
  n == null || n === 0 ? undefined : n > 0 ? "positive" : "negative";
const toneColor = (n: number | null | undefined) => TONE[tone(n) ?? "neutral"];
const fmtPrice = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const pnlColor = (v: number) => (v >= 0 ? TONE.positive : TONE.negative);
const profitFactor = (rows: { pnl: number }[]) => {
  const win = rows.filter((r) => r.pnl > 0).reduce((s, r) => s + r.pnl, 0);
  const loss = -rows.filter((r) => r.pnl <= 0).reduce((s, r) => s + r.pnl, 0);
  return loss ? win / loss : win ? Infinity : null;
};
const fmtFactor = (f: number | null) => (f === null ? "—" : f === Infinity ? "∞" : f.toFixed(2));

interface NameRow extends TradeName {
  priced: boolean;
  priceAsOf: string | null;
  unrealised: number;
  pnl: number;
  returnPct: number | null;
}

function priceName(n: TradeName, pricing: Pricing, base: string): NameRow {
  const p = n.status === "held" ? pricing(n.ticker) : null;
  const rate = p ? (p.currency === base ? 1 : p.rate) : null;
  const priced = n.status === "closed" || (p !== null && rate != null);
  const unrealised = p && rate != null ? n.openQuantity * p.price * rate - n.openCostBase : 0;
  const pnl = n.realisedBase + unrealised;
  return {
    ...n,
    priced,
    priceAsOf: p?.asOf.slice(0, 10) ?? null,
    unrealised,
    pnl,
    returnPct: n.peakCostBase ? pnl / n.peakCostBase : null,
  };
}

function NamesLens({ rows, base, nav }: { rows: NameRow[]; base: string; nav: number | null }) {
  const money = usePrivateMoney();
  const { hidden } = usePrivacy();
  const held = rows.filter((r) => r.status === "held");
  const unpriced = held.filter((r) => !r.priced);
  const scored = rows.filter((r) => r.priced);
  const wins = scored.filter((r) => r.pnl > 0);
  const byReturn = [...scored]
    .filter((r) => r.returnPct !== null)
    .sort((a, b) => a.returnPct! - b.returnPct!);
  const total = scored.reduce((s, r) => s + r.pnl, 0);
  const realised = rows.reduce((s, r) => s + r.realisedBase, 0);
  const unrealised = scored.reduce((s, r) => s + r.unrealised, 0);
  const capital = scored.map((r) => r.peakCostBase);
  const equity = nav != null ? nav - total : null;
  const firstTrade = rows.reduce((d, r) => (r.firstAt < d ? r.firstAt : d), "9999").slice(0, 10);
  const bars = [...scored]
    .sort((a, b) => b.pnl - a.pnl)
    .map((r) => ({ ticker: r.ticker, pnl: Math.round(r.pnl) }));
  const moneyAxis = (v: number) => (hidden ? "•••" : money(v, base));

  return (
    <>
      <Text size="sm" c="dimmed">
        A name is everything ever done on one company: its closed trades plus whatever is still
        held, priced live. Return is total P&L over the most capital the name tied up at any one
        time. Total return is total P&L over the equity it was earned on, broker NAV less that P&L.
        {unpriced.length
          ? ` ${unpriced.length} held ${unpriced.length === 1 ? "name has" : "names have"} no quote and count realised only: ${unpriced.map((r) => r.ticker).join(", ")}.`
          : ""}
      </Text>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }}>
        <Stat
          value={money(total, base)}
          label="Total P&L"
          tone={tone(total)}
          hint={`${money(realised, base)} realised · ${money(unrealised, base)} unrealised`}
        />
        <Stat
          value={equity && equity > 0 ? signedPct(total / equity) : "—"}
          label="Total return"
          tone={tone(total)}
          hint={
            equity && equity > 0
              ? `on ${money(equity, base)} equity · assumes no deposits since ${displayDate(firstTrade)}`
              : "no broker NAV"
          }
        />
        <Stat
          value={scored.length ? pct(wins.length / scored.length, 0) : "—"}
          label="Names in profit"
          tone={
            scored.length
              ? wins.length / scored.length >= 0.5
                ? "positive"
                : "negative"
              : undefined
          }
          hint={`${wins.length} of ${scored.length} · ${held.length} still held`}
        />
        <Stat
          value={fmtFactor(profitFactor(scored))}
          label="Profit factor"
          tone={(() => {
            const f = profitFactor(scored);
            return f === null ? undefined : f >= 1 ? "positive" : "negative";
          })()}
          hint="gains on winners ÷ losses on losers"
        />
        <Stat
          value={capital.length ? money(mean(capital)!, base) : "—"}
          label="Avg capital tied up"
          hint={
            capital.length ? `median ${money(median(capital)!, base)} · peak per name` : undefined
          }
        />
        <Stat
          value={byReturn.length ? signedPct(byReturn[byReturn.length - 1].returnPct!) : "—"}
          label="Best name"
          tone="positive"
          hint={
            byReturn.length
              ? `${byReturn[byReturn.length - 1].ticker} · ${money(byReturn[byReturn.length - 1].pnl, base)}`
              : undefined
          }
        />
        <Stat
          value={byReturn.length ? signedPct(byReturn[0].returnPct!) : "—"}
          label="Worst name"
          tone="negative"
          hint={
            byReturn.length ? `${byReturn[0].ticker} · ${money(byReturn[0].pnl, base)}` : undefined
          }
        />
        <Stat
          value={wins.length ? signedPct(mean(wins.map((r) => r.returnPct!))!) : "—"}
          label="Avg winner"
          tone="positive"
          hint={wins.length ? `${money(mean(wins.map((r) => r.pnl))!, base)} each` : undefined}
        />
      </SimpleGrid>

      {bars.length ? (
        <Card withBorder padding="sm">
          <Text fw={600} mb="xs">
            Total P&L by name
          </Text>
          <BarChart
            h={Math.max(160, bars.length * 22)}
            data={bars}
            dataKey="ticker"
            orientation="vertical"
            series={[{ name: "pnl", color: TONE.positive, label: "P&L" }]}
            getBarColor={(v) => pnlColor(v)}
            withLegend={false}
            gridAxis="x"
            tickLine="none"
            referenceLines={[{ x: 0, color: TONE.neutral }]}
            xAxisProps={{ tickFormatter: moneyAxis, hide: hidden }}
            yAxisProps={{ width: 72, interval: 0 }}
            valueFormatter={moneyAxis}
            tooltipAnimationDuration={0}
          />
        </Card>
      ) : null}

      <Table.ScrollContainer minWidth={900}>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>First</Table.Th>
              <Table.Th>Last</Table.Th>
              <Table.Th ta="right">Trades</Table.Th>
              <Table.Th ta="right">Closes won</Table.Th>
              <Table.Th ta="right">Capital</Table.Th>
              <Table.Th ta="right">Realised</Table.Th>
              <Table.Th ta="right">Unrealised</Table.Th>
              <Table.Th ta="right">Total</Table.Th>
              <Table.Th ta="right">Return</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {[...rows]
              .sort((a, b) => b.pnl - a.pnl)
              .map((r) => (
                <Table.Tr key={r.ticker}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={600}>{r.ticker}</Text>
                      {r.status === "held" ? (
                        <Badge size="xs" variant="light" color={TONE.info}>
                          held {r.openQuantity}
                        </Badge>
                      ) : null}
                      {r.status === "held" && !r.priced ? (
                        <Badge size="xs" variant="light" color={TONE.warning}>
                          no quote
                        </Badge>
                      ) : null}
                      {r.truncated ? (
                        <Badge size="xs" variant="light" color={TONE.neutral}>
                          history before statements
                        </Badge>
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>{displayDate(r.firstAt.slice(0, 10))}</Table.Td>
                  <Table.Td>{displayDate(r.lastAt.slice(0, 10))}</Table.Td>
                  <Table.Td ta="right">{r.roundTrips}</Table.Td>
                  <Table.Td ta="right">{r.closes ? `${r.closeWins} / ${r.closes}` : "—"}</Table.Td>
                  <Table.Td ta="right">{money(r.peakCostBase, base)}</Table.Td>
                  <Table.Td ta="right" c={toneColor(r.realisedBase)}>
                    {money(r.realisedBase, base)}
                  </Table.Td>
                  <Table.Td ta="right" c={toneColor(r.unrealised)}>
                    {r.status === "held" ? (r.priced ? money(r.unrealised, base) : "?") : "—"}
                  </Table.Td>
                  <Table.Td ta="right" c={toneColor(r.pnl)} fw={600}>
                    {money(r.pnl, base)}
                  </Table.Td>
                  <Table.Td ta="right" c={toneColor(r.returnPct)} fw={600}>
                    {r.returnPct === null ? "—" : signedPct(r.returnPct)}
                  </Table.Td>
                </Table.Tr>
              ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}

function streaks(rows: TradeClose[]) {
  let win = 0;
  let loss = 0;
  let run = 0;
  for (const r of rows) {
    const w = r.pnlBase > 0;
    run = run > 0 === w && run !== 0 ? run + (w ? 1 : -1) : w ? 1 : -1;
    if (run > win) win = run;
    if (-run > loss) loss = -run;
  }
  return { win, loss, current: run };
}

function closeStats(rows: TradeClose[]) {
  const wins = rows.filter((r) => r.pnlBase > 0);
  const losses = rows.filter((r) => r.pnlBase <= 0);
  const byReturn = [...rows].sort((a, b) => a.returnPct - b.returnPct);
  const byPnl = [...rows].sort((a, b) => a.pnlBase - b.pnlBase);
  const first = rows[0]?.dateTime.slice(0, 10);
  const last = rows[rows.length - 1]?.dateTime.slice(0, 10);
  const months =
    first && last ? Math.max(1, (Date.parse(last) - Date.parse(first)) / (30.44 * 86_400_000)) : 0;
  return {
    n: rows.length,
    wins: wins.length,
    losses: losses.length,
    winRate: rows.length ? wins.length / rows.length : null,
    pnl: rows.reduce((s, r) => s + r.pnlBase, 0),
    profitFactor: profitFactor(rows.map((r) => ({ pnl: r.pnlBase }))),
    expectancy: mean(rows.map((r) => r.pnlBase)),
    avgReturn: mean(rows.map((r) => r.returnPct)),
    medianReturn: median(rows.map((r) => r.returnPct)),
    avgWin: mean(wins.map((r) => r.returnPct)),
    avgLoss: mean(losses.map((r) => r.returnPct)),
    bestPct: byReturn[byReturn.length - 1] ?? null,
    worstPct: byReturn[0] ?? null,
    bestPnl: byPnl[byPnl.length - 1] ?? null,
    worstPnl: byPnl[0] ?? null,
    avgSize: mean(rows.map((r) => r.costBase)),
    medianSize: median(rows.map((r) => r.costBase)),
    perMonth: months ? rows.length / months : null,
    streaks: streaks(rows),
  };
}

const BIN = 0.1;
function histogram(rows: TradeClose[]) {
  const bins = new Map<number, number>();
  for (const r of rows) {
    const b = Math.floor(r.returnPct / BIN);
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  const keys = [...bins.keys()];
  const out: { bin: string; wins: number; losses: number }[] = [];
  for (let b = Math.min(...keys); b <= Math.max(...keys); b++) {
    const n = bins.get(b) ?? 0;
    out.push({
      bin: `${Math.round(b * BIN * 100)}…${Math.round((b + 1) * BIN * 100)}%`,
      wins: b >= 0 ? n : 0,
      losses: b < 0 ? n : 0,
    });
  }
  return out;
}

function ClosesLens({ rows, base }: { rows: TradeClose[]; base: string }) {
  const money = usePrivateMoney();
  const { hidden } = usePrivacy();
  const s = useMemo(() => closeStats(rows), [rows]);
  const moneyAxis = (v: number) => (hidden ? "•••" : money(v, base));
  const cumulative = useMemo(() => {
    let sum = 0;
    return rows.map((r) => ({ date: r.dateTime.slice(0, 10), pnl: (sum += r.pnlBase) }));
  }, [rows]);
  const monthly = useMemo(() => {
    const m = new Map<string, { month: string; closes: number; pnl: number }>();
    for (const r of rows) {
      const k = r.dateTime.slice(0, 7);
      const row = m.get(k) ?? { month: k, closes: 0, pnl: 0 };
      row.closes += 1;
      row.pnl += r.pnlBase;
      m.set(k, row);
    }
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [rows]);
  const byTicker = useMemo(() => {
    const m = new Map<string, TradeClose[]>();
    for (const r of rows) m.set(r.ticker, [...(m.get(r.ticker) ?? []), r]);
    return [...m.entries()]
      .map(([ticker, rs]) => ({ ticker, ...closeStats(rs) }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [rows]);
  const bestMonth = monthly.length ? monthly.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null;

  return (
    <>
      <Text size="sm" c="dimmed">
        A close is one selling fill, scored against the lots it sold on the broker's FIFO matching.
        Net of commissions, converted to {base} at the exit rate so currency moves stay out of the
        score. {s.n} closes in this period.
      </Text>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }}>
        <Stat
          value={money(s.pnl, base)}
          label="Realised P&L"
          tone={tone(s.pnl)}
          hint={
            bestMonth
              ? `best month ${displayDate(bestMonth.month)}: ${money(bestMonth.pnl, base)}`
              : undefined
          }
        />
        <Stat
          value={s.winRate === null ? "—" : pct(s.winRate, 0)}
          label="Win rate"
          tone={s.winRate === null ? undefined : s.winRate >= 0.5 ? "positive" : "negative"}
          hint={`${s.wins} won · ${s.losses} lost`}
        />
        <Stat
          value={fmtFactor(s.profitFactor)}
          label="Profit factor"
          tone={s.profitFactor === null ? undefined : s.profitFactor >= 1 ? "positive" : "negative"}
          hint="gross wins ÷ gross losses"
        />
        <Stat
          value={s.expectancy === null ? "—" : money(s.expectancy, base)}
          label="Expectancy"
          tone={tone(s.expectancy)}
          hint={
            s.avgReturn === null
              ? "per close"
              : `per close · avg ${signedPct(s.avgReturn)} · median ${signedPct(s.medianReturn!)}`
          }
        />
        <Stat
          value={s.bestPct ? signedPct(s.bestPct.returnPct) : "—"}
          label="Best close"
          tone="positive"
          hint={s.bestPct ? `${s.bestPct.ticker} · ${money(s.bestPct.pnlBase, base)}` : undefined}
        />
        <Stat
          value={s.worstPct ? signedPct(s.worstPct.returnPct) : "—"}
          label="Worst close"
          tone="negative"
          hint={
            s.worstPct ? `${s.worstPct.ticker} · ${money(s.worstPct.pnlBase, base)}` : undefined
          }
        />
        <Stat
          value={s.avgWin === null ? "—" : signedPct(s.avgWin)}
          label="Avg win"
          tone="positive"
          hint={
            s.avgLoss === null || s.avgWin === null || !s.avgLoss
              ? undefined
              : `payoff ${(s.avgWin / -s.avgLoss).toFixed(2)}× the avg loss`
          }
        />
        <Stat
          value={s.avgLoss === null ? "—" : signedPct(s.avgLoss)}
          label="Avg loss"
          tone="negative"
          hint={
            s.bestPnl && s.worstPnl
              ? `largest ${money(s.bestPnl.pnlBase, base)} · ${money(s.worstPnl.pnlBase, base)}`
              : undefined
          }
        />
        <Stat
          value={s.avgSize === null ? "—" : money(s.avgSize, base)}
          label="Avg size"
          hint={
            s.medianSize === null
              ? undefined
              : `median ${money(s.medianSize, base)} · cost of the lots sold`
          }
        />
        <Stat
          value={s.n ? `${s.streaks.win} / ${s.streaks.loss}` : "—"}
          label="Longest win / loss streak"
          tone={tone(s.streaks.current)}
          hint={
            s.n
              ? `now ${Math.abs(s.streaks.current)} ${s.streaks.current > 0 ? "wins" : "losses"} in a row`
              : undefined
          }
        />
        <Stat value={s.perMonth === null ? "—" : s.perMonth.toFixed(1)} label="Closes / month" />
      </SimpleGrid>

      {rows.length ? (
        <>
          <Card withBorder padding="sm">
            <Text fw={600} mb="xs">
              Cumulative realised P&L
            </Text>
            <AreaChart
              h={200}
              data={cumulative.map((point) => ({ ...point, date: displayDate(point.date) }))}
              dataKey="date"
              series={[{ name: "pnl", color: pnlColor(s.pnl), label: "P&L" }]}
              curveType="stepAfter"
              withDots={false}
              strokeWidth={2}
              withLegend={false}
              withGradient
              gridAxis="y"
              tickLine="none"
              referenceLines={[{ y: 0, color: TONE.neutral }]}
              yAxisProps={{ width: hidden ? 0 : 72 }}
              xAxisProps={{ minTickGap: 48 }}
              valueFormatter={moneyAxis}
              tooltipAnimationDuration={0}
            />
          </Card>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder padding="sm">
              <Text fw={600} mb="xs">
                Closes per month
              </Text>
              <BarChart
                h={200}
                data={monthly.map((point) => ({ ...point, month: displayDate(point.month) }))}
                dataKey="month"
                series={[{ name: "closes", color: TONE.info, label: "Closes" }]}
                withLegend={false}
                gridAxis="y"
                tickLine="none"
                yAxisProps={{ allowDecimals: false, width: 32 }}
                xAxisProps={{ minTickGap: 24 }}
                tooltipAnimationDuration={0}
              />
            </Card>
            <Card withBorder padding="sm">
              <Text fw={600} mb="xs">
                Realised P&L per month
              </Text>
              <BarChart
                h={200}
                data={monthly.map((point) => ({ ...point, month: displayDate(point.month) }))}
                dataKey="month"
                series={[{ name: "pnl", color: TONE.positive, label: "P&L" }]}
                getBarColor={(v) => pnlColor(v)}
                withLegend={false}
                gridAxis="y"
                tickLine="none"
                referenceLines={[{ y: 0, color: TONE.neutral }]}
                yAxisProps={{ width: hidden ? 0 : 72 }}
                xAxisProps={{ minTickGap: 24 }}
                valueFormatter={moneyAxis}
                tooltipAnimationDuration={0}
              />
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder padding="sm">
              <Text fw={600} mb="xs">
                Return distribution
              </Text>
              <BarChart
                h={200}
                data={histogram(rows)}
                dataKey="bin"
                type="stacked"
                series={[
                  { name: "losses", color: TONE.negative, label: "Losses" },
                  { name: "wins", color: TONE.positive, label: "Wins" },
                ]}
                withLegend
                legendProps={{ verticalAlign: "bottom" }}
                gridAxis="y"
                tickLine="none"
                yAxisProps={{ allowDecimals: false, width: 32 }}
                xAxisProps={{ minTickGap: 12 }}
                tooltipAnimationDuration={0}
              />
              <Text size="xs" c="dimmed">
                Net return per close, {Math.round(BIN * 100)}% bins.
              </Text>
            </Card>
            <Card withBorder padding="sm">
              <Text fw={600} mb="xs">
                By name
              </Text>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ticker</Table.Th>
                    <Table.Th ta="right">Closes</Table.Th>
                    <Table.Th ta="right">Win rate</Table.Th>
                    <Table.Th ta="right">P&L</Table.Th>
                    <Table.Th ta="right">Avg return</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {byTicker.map((t) => (
                    <Table.Tr key={t.ticker}>
                      <Table.Td>
                        <Text fw={600}>{t.ticker}</Text>
                      </Table.Td>
                      <Table.Td ta="right">{t.n}</Table.Td>
                      <Table.Td ta="right">{pct(t.winRate!, 0)}</Table.Td>
                      <Table.Td ta="right" c={toneColor(t.pnl)}>
                        {money(t.pnl, base)}
                      </Table.Td>
                      <Table.Td ta="right" c={toneColor(t.avgReturn)}>
                        {signedPct(t.avgReturn!)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </SimpleGrid>

          <Stack gap={4}>
            <Title order={4}>Closes</Title>
            <Table.ScrollContainer minWidth={720}>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ticker</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th ta="right">Quantity</Table.Th>
                    <Table.Th ta="right">Cost → price</Table.Th>
                    <Table.Th ta="right">Size</Table.Th>
                    <Table.Th ta="right">Return</Table.Th>
                    <Table.Th ta="right">P&L</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[...rows].reverse().map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text fw={600}>{r.ticker}</Text>
                          {r.direction === "short" ? (
                            <Badge size="xs" variant="light" color={TONE.warning}>
                              short
                            </Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>{displayDate(r.dateTime.slice(0, 10))}</Table.Td>
                      <Table.Td ta="right">{r.quantity}</Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {fmtPrice(r.cost / r.quantity)} → {fmtPrice(r.price)} {r.currency}
                      </Table.Td>
                      <Table.Td ta="right">{money(r.costBase, base)}</Table.Td>
                      <Table.Td ta="right" c={toneColor(r.returnPct)} fw={600}>
                        {signedPct(r.returnPct)}
                      </Table.Td>
                      <Table.Td ta="right" c={toneColor(r.pnlBase)}>
                        {money(r.pnlBase, base)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        </>
      ) : null}
    </>
  );
}

export function TradesPage({
  trades,
  pricing,
  nav,
}: {
  trades: TradesFile;
  pricing: Pricing;
  nav: number | null;
}) {
  const [period, setPeriod] = useLocalState("vantage:trades:period", "all");
  const [lens, setLens] = useLocalState("vantage:trades:lens", "names");
  const since = cutoff(period);
  const base = trades.baseCurrency;
  const closes = useMemo(
    () =>
      trades.closes
        .filter((r) => !since || r.dateTime >= since)
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime) || a.id.localeCompare(b.id)),
    [trades, since],
  );
  const names = useMemo(
    () =>
      trades.names
        .filter((n) => !since || n.lastAt >= since)
        .map((n) => priceName(n, pricing, base)),
    [trades, since, pricing, base],
  );
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Text size="sm" c="dimmed">
          Statements {displayDate(trades.from) || "?"} → {displayDate(trades.to) || "?"} ·{" "}
          {trades.fills.length} fills · {trades.names.length} names · {trades.closes.length} closes
        </Text>
        <Group gap="xs">
          <SegmentedControl size="xs" data={LENSES} value={lens} onChange={setLens} />
          <SegmentedControl size="xs" data={PERIODS} value={period} onChange={setPeriod} />
        </Group>
      </Group>
      {trades.warnings.length ? (
        <Alert color={TONE.warning} title="Notes">
          {trades.warnings.map((w) => (
            <Text size="sm" key={w}>
              {w}
            </Text>
          ))}
        </Alert>
      ) : null}
      {lens === "names" ? (
        <NamesLens rows={names} base={base} nav={nav} />
      ) : (
        <ClosesLens rows={closes} base={base} />
      )}
    </Stack>
  );
}
