import { LineChart } from "@mantine/charts";
import {
  Accordion,
  Alert,
  Card,
  Divider,
  Group,
  NumberInput,
  Paper,
  SimpleGrid,
  Slider,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { Stat } from "../components/Stat.tsx";
import type { Snapshot } from "../lib/broker.ts";
import { displayDate, pct } from "../lib/format.ts";
import { usePrivateMoney } from "../lib/privacy.tsx";
import { useLocalState } from "../lib/useLocalState.ts";
import { TONE } from "../theme.ts";

const GLOSSARY: [string, string][] = [
  [
    "Notional",
    "The full value of the position you'd hold — what moves up and down, not the cash you put in.",
  ],
  [
    "Margin rate on the bet",
    "Fraction of the position your own equity must cover at all times. The flip side is leverage: a rate of m allows up to 1 ÷ m × leverage (16.75% → ~6×, 50% → 2×). It sets how much you can buy (buying power = excess liquidity ÷ rate) and how much cushion the bet consumes (rate × notional).",
  ],
  [
    "Maintenance rate on the book",
    "What the broker requires you to keep against what you already hold, as a fraction of its value. The statement does not report the broker's figure; 25% is a common blended rate, concentrated books run higher.",
  ],
  [
    "Concentration margin",
    "Brokers raise the margin rate on a large single-name bet (one shock hits it all) — often 30–50% vs ~16.75% for a diversified book. Higher rate = you can buy less and the liquidation cushion is thinner.",
  ],
  [
    "Gross leverage",
    "Total stock exposure ÷ your own equity. 1× = no borrowing; 2× = 2 of stock per 1 you own (rest is the loan). Higher = bigger swings both ways and less room before liquidation.",
  ],
  [
    "Excess liquidity",
    "Cushion before forced liquidation = equity − maintenance margin. When it hits zero, the broker force-sells your positions.",
  ],
  [
    "Forced liquidation",
    "When excess liquidity hits zero the broker sells your positions for you, at the worst time and not of your choosing — the loss is locked in.",
  ],
  [
    "Correlated drawdown",
    "How much your existing holdings fall when the new bet falls. In a real selloff they move together, which liquidates you sooner than the bet alone would suggest.",
  ],
  [
    "Safety floor",
    "Your own rule: never let excess liquidity drop below this fraction of equity — a self-imposed buffer above the broker's hard liquidation point.",
  ],
  [
    "Kelly sizing",
    "Formula for the bet fraction that maximizes long-run compound growth given your edge: f = (P·g − (1−P)·l) / (g·l), where P = probability of being right, g = upside, l = downside. Full Kelly is growth-optimal but volatile; half-Kelly is the common practical cap. A negative result means no edge → don't bet.",
  ],
];

function Knob({
  label,
  value,
  onChange,
  hint,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  step?: number;
}) {
  return (
    <Stack gap={4}>
      <NumberInput
        label={label}
        value={value}
        step={step}
        onChange={(v) => onChange(typeof v === "number" ? v : Number(v) || 0)}
      />
      {hint ? (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
}

export function MarginSizing({ snapshot }: { snapshot: Snapshot }) {
  const money = usePrivateMoney();
  const currency = snapshot.base_currency ?? "EUR";
  const eur = (n: number) => money(n, currency);
  const nlv = snapshot.nav ?? 0;
  const cash = snapshot.cash ?? 0;
  const bookValue = nlv - cash;

  const [maintRate, setMaintRate] = useLocalState("margin.maintRate", 0.25);
  const [betSize, setBetSize] = useLocalState("margin.betSize", Math.round(nlv / 2));
  const [marginRate, setMarginRate] = useLocalState("margin.marginRate", 0.1675);
  const [corr, setCorr] = useLocalState("margin.corr", 0.3);
  const [floorPct, setFloorPct] = useLocalState("margin.floorPct", 0.25);
  const [pUp, setPUp] = useLocalState("margin.pUp", 0.6);
  const [gUp, setGUp] = useLocalState("margin.gUp", 0.5);
  const [lDown, setLDown] = useLocalState("margin.lDown", 0.3);

  const maintMargin = maintRate * bookValue;
  const excessLiq = nlv - maintMargin;
  const buyingPower = excessLiq / marginRate;

  const elAfter = excessLiq - marginRate * betSize;
  const maxAffordable = excessLiq / marginRate;
  const grossLev = nlv > 0 ? (bookValue + betSize) / nlv : 0;

  const denom = betSize * (1 - marginRate) + corr * (bookValue - maintMargin);
  const xLiq = denom > 0 ? elAfter / denom : Infinity;

  const floorEur = floorPct * nlv;
  const maxByPolicy = (excessLiq - floorEur) / marginRate;
  const policyOk = elAfter >= floorEur;
  const overMargin = elAfter < 0;

  const drops = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
  const chartData = drops.map((x) => ({
    drop: `-${Math.round(x * 100)}%`,
    correlated: Math.round(elAfter - x * denom),
    betOnly: Math.round(elAfter - x * betSize * (1 - marginRate)),
    floor: 0,
  }));

  const stressDrops = [0.1, 0.2, 0.3, 0.4];
  const stressDenom = betSize * (1 - marginRate) + (bookValue - maintMargin);

  const kellyFull = (pUp * gUp - (1 - pUp) * lDown) / (gUp * lDown);
  const kellyHalfEur = (kellyFull / 2) * nlv;
  const kellyFullEur = kellyFull * nlv;
  const overBet = betSize > kellyFullEur;

  const liqLabel = Number.isFinite(xLiq) ? pct(Math.min(xLiq, 9.99)) : "never (no margin used)";

  const downMoves = [-xLiq, -0.3, -0.2, -0.1];
  const upMoves = [0.2, 0.5, 1.0, gUp];

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        {currency} · statement {displayDate(snapshot.as_of)} · mechanical sizing only, not
        investment advice. Move the bet slider; everything recomputes.
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <Stat value={eur(betSize)} label="Bet size (notional)" />
        <Stat
          value={liqLabel}
          label="Bet can fall before liquidation"
          tone={xLiq < 0.25 ? "negative" : xLiq < 0.4 ? "warning" : "positive"}
        />
        <Stat
          value={eur(elAfter)}
          label="Excess liquidity after"
          tone={overMargin ? "negative" : policyOk ? "positive" : "warning"}
        />
        <Stat value={`${grossLev.toFixed(2)}×`} label="Gross leverage after" />
      </SimpleGrid>

      {overMargin ? (
        <Alert color={TONE.negative} title="Bet exceeds available margin">
          This bet needs {eur(marginRate * betSize)} of margin but you only have {eur(excessLiq)}.
          Max affordable at a {pct(marginRate)} requirement is {eur(maxAffordable)}.
        </Alert>
      ) : !policyOk ? (
        <Alert color={TONE.warning} title="Below your safety floor">
          Leaves {eur(elAfter)} excess liquidity, under your {pct(floorPct, 0)}-of-equity floor (
          {eur(floorEur)}). Policy-max bet: {eur(maxByPolicy)}.
        </Alert>
      ) : (
        <Alert color={TONE.positive} title="Within policy">
          Leaves {eur(elAfter)} excess liquidity (floor {eur(floorEur)}). A {liqLabel} drop on the
          bet triggers forced liquidation
          {corr > 0 ? `, assuming your existing book falls ${pct(corr, 0)} as much.` : "."}
        </Alert>
      )}

      <Card withBorder>
        <Stack gap="md">
          <Stack gap={4}>
            <Group justify="space-between">
              <Text fw={500}>Bet size</Text>
              <Text size="sm" c="dimmed">
                {eur(betSize)} · {pct(nlv ? betSize / nlv : 0, 0)} of equity ·{" "}
                {pct(buyingPower ? betSize / buyingPower : 0, 0)} of buying power
              </Text>
            </Group>
            <Slider
              value={betSize}
              min={0}
              max={Math.max(1000, Math.round(buyingPower))}
              step={1000}
              onChange={setBetSize}
              label={eur(betSize)}
            />
          </Stack>

          <Stack gap={4}>
            <Group justify="space-between">
              <Text fw={500}>Existing-book co-movement</Text>
              <Text size="sm" c="dimmed">
                {pct(corr, 0)}
              </Text>
            </Group>
            <Slider value={corr} min={0} max={1} step={0.05} onChange={setCorr} />
            <Text size="xs" c="dimmed">
              How much your current {eur(bookValue)} book falls when the new bet falls. 0% =
              uncorrelated, 100% = moves together.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
            <Knob
              label="Maintenance rate on the book"
              value={maintRate}
              onChange={setMaintRate}
              hint={`Stands in for the broker's requirement: ${eur(maintMargin)} on ${eur(bookValue)}, leaving ${eur(excessLiq)} excess liquidity.`}
            />
            <Knob
              label="Margin rate on the bet"
              value={marginRate}
              onChange={setMarginRate}
              hint={`= up to ${(1 / marginRate).toFixed(1)}× leverage on this position. Use 0.30–0.50 to stress a concentrated single name.`}
            />
            <Knob
              label="Safety floor (× equity)"
              value={floorPct}
              onChange={setFloorPct}
              hint="Keep excess liquidity above this fraction of equity."
            />
            <Knob
              label="Bet's downside if wrong"
              value={lDown}
              onChange={setLDown}
              hint="Used for Kelly sizing below."
            />
          </SimpleGrid>
        </Stack>
      </Card>

      <Stack gap={4}>
        <Title order={4}>Excess liquidity vs drop on the bet</Title>
        <Text size="sm" c="dimmed">
          Where a line crosses the liquidation floor (0), the broker force-liquidates. The
          correlated line uses your {pct(corr, 0)} assumption; the bet-only line ignores
          existing-book moves.
        </Text>
        <LineChart
          h={260}
          data={chartData}
          dataKey="drop"
          withLegend
          valueFormatter={(v) => eur(v)}
          series={[
            { name: "correlated", label: `EL (corr ${pct(corr, 0)})`, color: TONE.info },
            { name: "betOnly", label: "EL (bet only)", color: TONE.neutral },
            { name: "floor", label: "Liquidation floor", color: TONE.negative },
          ]}
        />
      </Stack>

      <Stack gap={4}>
        <Title order={4}>Downside / upside on this bet</Title>
        <Table.ScrollContainer minWidth={520}>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Scenario</Table.Th>
                <Table.Th ta="right">Move</Table.Th>
                <Table.Th ta="right">P&L on bet</Table.Th>
                <Table.Th ta="right">% of equity</Table.Th>
                <Table.Th>Note</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {downMoves.map((m, i) => (
                <Table.Tr key={`d${i}`}>
                  <Table.Td c={i === 0 ? TONE.negative : undefined}>
                    {i === 0 ? "Forced liquidation" : "Drawdown"}
                  </Table.Td>
                  <Table.Td ta="right">{Number.isFinite(m) ? pct(m) : "—"}</Table.Td>
                  <Table.Td ta="right">{Number.isFinite(m) ? eur(betSize * m) : "—"}</Table.Td>
                  <Table.Td ta="right">
                    {Number.isFinite(m) && nlv ? pct((betSize * m) / nlv) : "—"}
                  </Table.Td>
                  <Table.Td>
                    {i === 0 ? "broker sells, loss is locked in" : "still holding"}
                  </Table.Td>
                </Table.Tr>
              ))}
              {upMoves.map((m, i) => (
                <Table.Tr key={`u${i}`}>
                  <Table.Td c={TONE.positive}>Upside</Table.Td>
                  <Table.Td ta="right">+{pct(m, 0)}</Table.Td>
                  <Table.Td ta="right">{eur(betSize * m)}</Table.Td>
                  <Table.Td ta="right">+{pct(nlv ? (betSize * m) / nlv : 0)}</Table.Td>
                  <Table.Td>before tax/interest</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Stack gap={4}>
          <Title order={5}>Whole-portfolio stress test</Title>
          <Text size="sm" c="dimmed">
            Everything (bet + existing book) drops together.
          </Text>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th ta="right">Market drop</Table.Th>
                <Table.Th ta="right">Excess liq.</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stressDrops.map((d) => {
                const el = elAfter - d * stressDenom;
                return (
                  <Table.Tr key={d}>
                    <Table.Td ta="right">{pct(-d, 0)}</Table.Td>
                    <Table.Td ta="right">{eur(el)}</Table.Td>
                    <Table.Td c={el < 0 ? TONE.negative : TONE.positive}>
                      {el < 0 ? "LIQUIDATED" : "survives"}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>

        <Card withBorder>
          <Stack gap="sm">
            <Title order={5}>Kelly sizing reference</Title>
            <SimpleGrid cols={3}>
              <Knob label="P(up)" value={pUp} onChange={setPUp} />
              <Knob label="Upside if right" value={gUp} onChange={setGUp} />
              <Knob label="Downside if wrong" value={lDown} onChange={setLDown} />
            </SimpleGrid>
            <Divider />
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Stat
                value={kellyFull > 0 ? eur(kellyFullEur) : "no edge"}
                label="Full Kelly notional"
              />
              <Stat
                value={kellyFull > 0 ? eur(kellyHalfEur) : "—"}
                label="Half Kelly (suggested cap)"
                tone="info"
              />
              <Stat
                value={kellyFull <= 0 ? "no edge" : overBet ? "over Kelly" : "within"}
                label={`Your ${eur(betSize)} bet`}
                tone={kellyFull <= 0 || overBet ? "negative" : "positive"}
              />
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              {kellyFull <= 0
                ? "Negative edge at these odds — Kelly says don't bet."
                : overBet
                  ? "Your bet exceeds full Kelly — over-betting risk; half-Kelly is the practical cap."
                  : betSize > kellyHalfEur
                    ? "Within full Kelly but above half-Kelly — fine, but on the aggressive side."
                    : "Within half-Kelly — conservative side of the optimal range."}{" "}
              Heuristic, not advice — see glossary.
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      <Accordion variant="contained">
        <Accordion.Item value="account">
          <Accordion.Control>Figures used ({displayDate(snapshot.as_of)})</Accordion.Control>
          <Accordion.Panel>
            <Paper p="sm">
              <Text size="sm">
                Net liquidation {eur(nlv)} · cash {eur(cash)} · existing book {eur(bookValue)} from
                the statement. Maintenance margin {eur(maintMargin)} ({pct(maintRate, 0)} of the
                book), excess liquidity {eur(excessLiq)} and buying power {eur(buyingPower)} are
                derived from the rates above.
              </Text>
            </Paper>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="glossary">
          <Accordion.Control>Glossary</Accordion.Control>
          <Accordion.Panel>
            <Table>
              <Table.Tbody>
                {GLOSSARY.map(([term, meaning]) => (
                  <Table.Tr key={term}>
                    <Table.Td w={220} fw={500}>
                      {term}
                    </Table.Td>
                    <Table.Td>{meaning}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
