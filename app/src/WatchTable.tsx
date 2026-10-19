import { Badge, Group, Table, Text, Tooltip } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { BaseCurrency, HistoryRange } from "@shared/types.ts";
import type { Display } from "./Charts.tsx";
import { asHistory, asSession, type ChartItem, type ChartsResponse } from "./lib/api.ts";
import { resolver, type PositionRow } from "./lib/broker.ts";
import { demoBroker } from "./lib/demo/index.ts";
import { money, signedPct } from "./lib/format.ts";
import { supabase, useSession } from "./lib/supabase.ts";
import { TONE } from "./theme.ts";

type Horizon = "1d" | "1w" | HistoryRange;
const HORIZONS: { key: Horizon; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "1w", label: "5D" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
];

export type ListQuote = {
  price: number | null;
  currency?: string;
  changes: Partial<Record<Horizon, number | null>>;
};

function inDisplayCurrency(
  points: [string, number][],
  converted: Record<BaseCurrency, (number | null)[]> | undefined,
  currency: string | undefined,
  base: Display,
) {
  const use = base !== "native" && currency !== base ? converted?.[base] : undefined;
  return {
    values: points.map(([, native], i) => (use ? (use[i] ?? null) : native)),
    currency: use ? base : currency,
    converted: Boolean(use),
  };
}

const known = (values: (number | null)[]) => values.filter((v): v is number => v != null);
const move = (from: number | null | undefined, to: number | undefined) =>
  from && to != null ? to / from - 1 : null;

/** Each move is measured the way its chart measures it. */
export function listQuotes(
  tickers: string[],
  day: ChartsResponse | undefined,
  week: ChartsResponse | undefined,
  history: ChartsResponse | undefined,
  base: Display,
): Map<string, ListQuote> {
  return new Map(
    tickers.map((t) => {
      const changes: ListQuote["changes"] = {};
      let price: number | null = null;
      let currency: string | undefined;

      const session = asSession(day?.series[t]);
      if (session) {
        const s = inDisplayCurrency(session.points, session.converted, session.currency, base);
        const last = known(s.values).at(-1);
        const previous = s.converted
          ? session.previousCloseConverted?.[base as BaseCurrency]
          : session.previousClose;
        price = last ?? null;
        currency = s.currency;
        changes["1d"] = move(previous, last);
      }
      const five = asSession(week?.series[t]);
      if (five) {
        const v = known(inDisplayCurrency(five.points, five.converted, five.currency, base).values);
        changes["1w"] = move(v[0], v.at(-1));
      }
      const h = asHistory(history?.series[t]);
      for (const range of ["1m", "3m", "6m", "ytd", "1y", "5y"] as const) {
        const src = h?.ranges?.[range];
        if (!src?.points.length) continue;
        const s = inDisplayCurrency(src.points, src.converted, h!.currency, base);
        const v = known(s.values);
        changes[range] = move(v[0], v.at(-1));
        if (price == null && range === "1m") {
          price = v.at(-1) ?? null;
          currency = s.currency;
        }
      }
      return [t, { price, currency, changes }];
    }),
  );
}

/** Null while signed out or never synced. */
export function useHeld(items: ChartItem[], enabled: boolean): Set<string> | null {
  const session = useSession();
  const [positions, setPositions] = useState<Pick<PositionRow, "symbol" | "quantity">[] | null>(
    null,
  );
  useEffect(() => {
    if (!enabled || session === undefined) {
      setPositions(null);
      return;
    }
    if (!session || !supabase) {
      setPositions(demoBroker().snapshot?.positions ?? null);
      return;
    }
    let disposed = false;
    void supabase
      .from("portfolio_snapshots")
      .select("positions:snapshot_positions(symbol,quantity)")
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!disposed)
          setPositions((data?.positions as Pick<PositionRow, "symbol" | "quantity">[]) ?? null);
      });
    return () => {
      disposed = true;
    };
  }, [session, enabled]);
  return useMemo(() => {
    if (!positions) return null;
    const resolve = resolver(items);
    return new Set(positions.filter((p) => p.quantity !== 0).map((p) => resolve(p.symbol)));
  }, [positions, items]);
}

function ChangeCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <Table.Td ta="right">—</Table.Td>;
  return (
    <Table.Td ta="right" c={value > 0 ? TONE.positive : value < 0 ? TONE.negative : undefined}>
      {signedPct(value)}
    </Table.Td>
  );
}

// Pinned widths and fixed layout make the per-group tables line up down the page.
export function WatchTable({
  tickers,
  itemByTicker,
  quotes,
  held,
}: {
  tickers: string[];
  itemByTicker: Map<string, ChartItem>;
  quotes: Map<string, ListQuote>;
  held: Set<string> | null;
}) {
  return (
    <Table.ScrollContainer minWidth={held ? 1000 : 940}>
      <Table striped withTableBorder layout="fixed" style={{ fontVariantNumeric: "tabular-nums" }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={held ? 140 : 80}>Ticker</Table.Th>
            <Table.Th w={240}>Name</Table.Th>
            <Table.Th ta="right" w={120}>
              Price
            </Table.Th>
            {HORIZONS.map((h) => (
              <Table.Th key={h.key} ta="right" w={72}>
                {h.label}
              </Table.Th>
            ))}
            {/* Keeps the numbers beside the names instead of at the far edge. */}
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tickers.map((t) => {
            const quote = quotes.get(t);
            return (
              <Table.Tr key={t}>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    {held &&
                      (held.has(t) ? (
                        <Tooltip label="Held — see the Portfolio page for size">
                          <Badge size="xs" color={TONE.info} variant="filled">
                            held
                          </Badge>
                        </Tooltip>
                      ) : (
                        <Badge size="xs" variant="default" c="dimmed">
                          watch
                        </Badge>
                      ))}
                    <Text fw={600} size="sm">
                      {t}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" truncate>
                    {itemByTicker.get(t)?.name ?? ""}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  {/* Cents matter on a EUR30 stock, not on a KRW1.7m one, where they only make the cell wrap. */}
                  {quote?.price != null ? (
                    quote.currency ? (
                      money(quote.price, quote.currency, quote.price >= 1000 ? 0 : 2)
                    ) : (
                      quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                    )
                  ) : (
                    <Text c="dimmed">—</Text>
                  )}
                </Table.Td>
                {HORIZONS.map((h) => (
                  <ChangeCell key={h.key} value={quote?.changes[h.key]} />
                ))}
                <Table.Td />
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
